import { useState } from 'react';
import { Gavel, ShieldCheck, Scale, BrainCircuit } from 'lucide-react';
import { login, register } from '../api';

export default function Auth({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const data = await login(email, password);
        onLoginSuccess(data.access_token, email);
      } else {
        // Frontend validation for complexity
        const hasUpper = /[A-Z]/.test(password);
        const hasNumber = /\d/.test(password);
        const hasSpecial = /[@$!%*?&]/.test(password);

        if (!hasUpper || !hasNumber || !hasSpecial || password.length < 8) {
          throw new Error('Password does not meet complexity requirements.');
        }

        await register(username, email, password);
        const data = await login(email, password);
        onLoginSuccess(data.access_token, email);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      {/* Left Panel: Legal Case Law Brand Info (Unique & Cinematic) */}
      <div className="auth-graphic-side">
        <div className="graphic-brand">
          <div className="graphic-brand-logo">
            <Gavel size={24} color="white" />
          </div>
          <span className="graphic-brand-name">Legal Case Law RAG</span>
        </div>

        <div className="graphic-content">
          <h2>The Supreme Intelligence for Case Law Research</h2>
          <p>
            An advanced, cloud-resilient legal analysis assistant powered by lightning-fast AI reranking and secure document audit guardrails.
          </p>

          <div className="feature-highlights">
            <div className="feature-item">
              <div className="feature-icon-wrapper">
                <BrainCircuit size={18} />
              </div>
              <span className="feature-text">Dual Cloud LLM Failover & Real-Time Stream responses</span>
            </div>

            <div className="feature-item">
              <div className="feature-icon-wrapper">
                <Scale size={18} />
              </div>
              <span className="feature-text">High-Accuracy Indian Legal Embeddings & Reranking</span>
            </div>

            <div className="feature-item">
              <div className="feature-icon-wrapper">
                <ShieldCheck size={18} />
              </div>
              <span className="feature-text">Secure Native Cryptography & Document Audit Guardrails</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel: The Interactive Sleek Glassmorphic Form Card */}
      <div className="auth-form-side">
        <div className="auth-card">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <div className="graphic-brand-logo" style={{ width: '60px', height: '60px', borderRadius: '16px' }}>
              <Gavel size={30} color="white" />
            </div>
          </div>
          <h1>{isLogin ? 'Welcome Back' : 'Create Account'}</h1>
          <p className="auth-subtitle">
            {isLogin
              ? 'Sign in to access your legal documents and case analysis.'
              : 'Create an account to start your legal case research.'}
          </p>

          <form onSubmit={handleSubmit}>
            {!isLogin && (
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  type="text"
                  placeholder="Case Manager ID"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                placeholder="lawyer@firm.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              {!isLogin && (
                <p className="password-hint" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem', lineHeight: '1.4' }}>
                  Must contain 8+ characters, 1 uppercase, 1 number, and 1 special symbol.
                </p>
              )}
            </div>

            {error && (
              <div style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.75rem', borderRadius: '10px', marginBottom: '1.25rem', fontSize: '0.85rem', textAlign: 'center', fontWeight: '500' }}>
                {error}
              </div>
            )}

            <button type="submit" className="auth-btn" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p className="toggle-auth" style={{ marginBottom: 0 }}>
            {isLogin ? "New to Case Assistant? " : "Already have an account? "}
            <span onClick={() => setIsLogin(!isLogin)}>
              {isLogin ? 'Create one now' : 'Sign in here'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
