import os
import logging
import torch
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from sentence_transformers import CrossEncoder
from ..core.config import settings
import langsmith as ls
from langsmith import traceable

# Suppress noisy logs
logging.getLogger("sentence_transformers").setLevel(logging.ERROR)
logging.getLogger("transformers").setLevel(logging.ERROR)

class ResilientLLMProxy:
    """
    A transparent proxy wrapper for LangChain chat models that provides 
    resilient runtime failover. If the primary LLM fails (e.g. rate limit, 
    service down), it automatically switches to the backup LLM.
    """
    def __init__(self, primary, backup=None):
        self.primary = primary
        self.backup = backup

    def invoke(self, *args, **kwargs):
        try:
            return self.primary.invoke(*args, **kwargs)
        except Exception as e:
            if self.backup:
                print(f"\n⚠️ [RUNTIME FAILOVER] Primary LLM ({type(self.primary).__name__}) failed: {e}.\n"
                      f"🔄 Falling back to Backup LLM ({type(self.backup).__name__})...")
                return self.backup.invoke(*args, **kwargs)
            raise e

    async def ainvoke(self, *args, **kwargs):
        try:
            return await self.primary.ainvoke(*args, **kwargs)
        except Exception as e:
            if self.backup:
                print(f"\n⚠️ [RUNTIME FAILOVER] Primary LLM ({type(self.primary).__name__}) failed: {e}.\n"
                      f"🔄 Falling back to Backup LLM ({type(self.backup).__name__})...")
                return await self.backup.ainvoke(*args, **kwargs)
            raise e

    async def astream(self, *args, **kwargs):
        try:
            async for chunk in self.primary.astream(*args, **kwargs):
                yield chunk
        except Exception as e:
            if self.backup:
                print(f"\n⚠️ [RUNTIME FAILOVER] Primary LLM ({type(self.primary).__name__}) streaming failed: {e}.\n"
                      f"🔄 Falling back to Backup LLM ({type(self.backup).__name__})...")
                async for chunk in self.backup.astream(*args, **kwargs):
                    yield chunk
            else:
                raise e

    def stream(self, *args, **kwargs):
        try:
            for chunk in self.primary.stream(*args, **kwargs):
                yield chunk
        except Exception as e:
            if self.backup:
                print(f"\n⚠️ [RUNTIME FAILOVER] Primary LLM ({type(self.primary).__name__}) streaming failed: {e}.\n"
                      f"🔄 Falling back to Backup LLM ({type(self.backup).__name__})...")
                for chunk in self.backup.stream(*args, **kwargs):
                    yield chunk
            else:
                raise e

class RAGService:
    def __init__(self):
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Loading {settings.EMBEDDING_MODEL_NAME} on {device}...")
        self.embeddings = HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL_NAME,
            model_kwargs={"device": device}
        )
        
        print(f"Loading {settings.RERANKER_MODEL_NAME} on {device}...")
        self.reranker = CrossEncoder(
            settings.RERANKER_MODEL_NAME, 
            trust_remote_code=True,
            device=device,
            automodel_args={"torch_dtype": torch.float16}
        )
        
        # Initialize Resilient LLMs
        self.llm = self._setup_llms()

    def _setup_llms(self):
        # 1. Initialize Groq model if key is present
        groq_model = None
        if settings.GROQ_API_KEY:
            try:
                groq_model = ChatGroq(
                    model_name=settings.GROQ_MODEL_NAME,
                    temperature=settings.LLM_TEMPERATURE,
                    groq_api_key=settings.GROQ_API_KEY,
                    max_retries=settings.LLM_MAX_RETRIES
                )
            except Exception as e:
                print(f"[-] Failed to initialize Groq model: {e}")

        # 2. Initialize Gemini model if key is present
        gemini_model = None
        if settings.GEMINI_API_KEY:
            try:
                gemini_model = ChatGoogleGenerativeAI(
                    model=settings.LLM_MODEL_NAME, 
                    google_api_key=settings.GEMINI_API_KEY,
                    temperature=settings.LLM_TEMPERATURE,
                    max_retries=settings.LLM_MAX_RETRIES
                )
            except Exception as e:
                print(f"[-] Failed to initialize Gemini model: {e}")

        # 3. Configure primary and backup models based on active preference
        primary = None
        backup = None

        if settings.ACTIVE_LLM == "groq" and groq_model:
            primary = groq_model
            backup = gemini_model
        elif gemini_model:
            primary = gemini_model
            backup = groq_model
        else:
            primary = groq_model or gemini_model
            backup = None

        if not primary:
            raise ValueError(
                "CRITICAL: No LLM models could be initialized! Please configure at least "
                "one valid API key (GEMINI_API_KEY or GROQ_API_KEY) in your environment."
            )

        print(f"[+] Resilient LLM System loaded successfully.")
        print(f"    - Primary Provider: {type(primary).__name__} (Model: {getattr(primary, 'model_name', getattr(primary, 'model', 'default'))})")
        print(f"    - Backup Provider: {type(backup).__name__ if backup else 'None'}")
        
        return ResilientLLMProxy(primary=primary, backup=backup)

    @traceable
    def rerank_results(self, query, candidates):
        if not candidates:
            return []
        try:
            cross_inp = [[query, c] for c in candidates]
            scores = self.reranker.predict(cross_inp, batch_size=16, show_progress_bar=False, convert_to_tensor=True)
            return scores.tolist()
        except Exception as e:
            print(f"Reranker Error: {e}. Falling back to default order.")
            return [1.0 - (i * 0.01) for i in range(len(candidates))]

    def detect_intent(self, query: str) -> str:
        query = query.lower()
        if any(word in query for word in ["summary", "summarize", "brief", "overview"]):
            return "SUMMARY"
        elif any(word in query for word in ["judgment", "outcome", "verdict", "decision"]):
            return "JUDGMENT"
        elif any(word in query for word in ["fact", "evidence", "background"]):
            return "FACTS"
        elif any(word in query for word in ["why", "reasoning", "analysis"]):
            return "REASONING"
        else:
            return "GENERAL"

    def get_dynamic_prompt(self, intent: str):
        base_rules = """
        CRITICAL RULES:
        1. Base your answer strictly on context.
        2. MISSING INFO: Answer naturally based ONLY on context, don't use repetitive disclaimers.
        3. LEGAL ONLY: If context isn't legal, refuse.
        4. STYLE: Plain text only. No markdown, no bold, no lists. Follow the requested intent in your tone.
        """
        prompts = {
            "SUMMARY": f"You are a Legal Clerk. Summarize the case background, issue, and outcome. {base_rules}",
            "JUDGMENT": f"You are a Judge. State the final legal outcome clearly. {base_rules}",
            "FACTS": f"You are a Legal Researcher. Extract facts and evidence. {base_rules}",
            "REASONING": f"You are a Constitutional Expert. Explain the reasoning behind the decision. {base_rules}",
            "GENERAL": f"You are a Legal Assistant. Answer the question based on context. {base_rules}"
        }
        return prompts.get(intent, prompts["GENERAL"])

    @traceable
    async def generate_answer_stream(self, query, context_list, brief=False, trace_metadata=None):
        intent = self.detect_intent(query)
        context_str = "\n\n".join(context_list)
        system_prompt = self.get_dynamic_prompt(intent)
        
        if brief:
            system_prompt += "\nINSTRUCTION: Be extremely concise. Focus strictly on the provided context."

        user_prompt = f"CONTEXT:\n{context_str}\n\nUSER QUESTION: {query}\n\nANSWER BASED ON INTENT ({intent}):"
        
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt)
        ]
        
        async for chunk in self.llm.astream(messages, config={"metadata": trace_metadata}):
            yield chunk.content

    def validate_is_legal(self, text_sample: str) -> bool:
        if not text_sample or len(text_sample.strip()) < 50:
            return True # Conservative default
        
        prompt = (
            "You are a legal document auditor. Is the following text sample from a legal or quasi-legal document? "
            "Count official court judgments, statutes, case summaries, legal commentaries, contracts, and academic legal articles as YES. "
            "Reject unrelated technical manuals, personal letters, or general news that doesn't reference specific law. "
            "Respond with 'YES' or 'NO' only.\n\n"
            f"TEXT SAMPLE:\n{text_sample[:1200]}"
        )
        try:
            response = self.llm.invoke(prompt)
            return "YES" in response.content.upper()
        except:
            return True

rag_service = RAGService()
