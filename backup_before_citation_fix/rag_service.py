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
        
        # Initialize LLM
        self.llm = self._setup_llm()

    def _setup_llm(self):
        if settings.ACTIVE_LLM == "groq" and settings.GROQ_API_KEY:
            return ChatGroq(
                model_name=settings.GROQ_MODEL_NAME,
                temperature=settings.LLM_TEMPERATURE,
                groq_api_key=settings.GROQ_API_KEY,
                max_retries=settings.LLM_MAX_RETRIES
            )
        elif settings.ACTIVE_LLM == "ollama":
            from langchain_community.chat_models import ChatOllama
            return ChatOllama(
                model=settings.OLLAMA_MODEL_NAME,
                temperature=settings.LLM_TEMPERATURE,
                base_url=settings.OLLAMA_BASE_URL
            )
        else:
            return ChatGoogleGenerativeAI(
                model=settings.LLM_MODEL_NAME, 
                google_api_key=settings.GEMINI_API_KEY,
                temperature=settings.LLM_TEMPERATURE,
                max_retries=settings.LLM_MAX_RETRIES
            )

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
        4. CITATION: Use exactly one consolidated citation at the end. List EVERY unique page number found in the context for each source. 
           Format: [Source: filename, Pages: 1, 4, 9]
           NEVER use "various", "multiple", or "etc". If multiple pages apply, list them all.
        5. STYLE: Plain text only. No markdown, no bold, no lists.
        """
        prompts = {
            "SUMMARY": f"You are a Legal Clerk. Summarize the case background, issue, and outcome. {base_rules}",
            "JUDGMENT": f"You are a Judge. State the final legal outcome clearly. {base_rules}",
            "FACTS": f"You are a Legal Researcher. Extract facts and evidence. {base_rules}",
            "REASONING": f"You are a Constitutional Expert. Explain the reasoning behind the decision. {base_rules}",
            "GENERAL": f"You are a Legal Assistant. Answer the question based on context. {base_rules}"
        }
        return prompts.get(intent, prompts["GENERAL"])

    async def generate_answer_stream(self, query, context_list, source_documents=None, trace_metadata=None):
        intent = self.detect_intent(query)
        context_str = "\n\n".join(context_list)
        system_prompt = self.get_dynamic_prompt(intent)
        user_prompt = f"CONTEXT:\n{context_str}\n\nUSER QUESTION: {query}\n\nANSWER BASED ON INTENT ({intent}):"
        
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt)
        ]
        
        async for chunk in self.llm.astream(messages):
            yield chunk.content

    def validate_is_legal(self, text_sample: str) -> bool:
        if not text_sample or len(text_sample.strip()) < 50:
            return True # Conservative default
        
        prompt = f"Is the following text sample from an official legal document like a judgment or statute? Respond YES or NO ONLY.\n\n{text_sample[:1000]}"
        try:
            response = self.llm.invoke(prompt)
            return "YES" in response.content.upper()
        except:
            return True

rag_service = RAGService()
