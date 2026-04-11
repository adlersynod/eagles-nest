'use client'

import { useState } from 'react'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        window.location.href = '/'
      } else {
        const data = await res.json()
        setError(data.error || 'Incorrect password.')
        setPassword('')
      }
    } catch {
      setError('Network error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-header">
          <span className="login-icon">🦅</span>
          <h1>Eagle&apos;s Nest</h1>
          <p>Enter password to access</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            autoComplete="current-password"
            disabled={loading}
          />

          {error && <p className="login-error">{error}</p>}

          <button type="submit" disabled={loading || !password.trim()}>
            {loading ? 'Unlocking…' : 'Enter'}
          </button>
        </form>
      </div>

      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0f1923 0%, #1a2a3a 100%);
          padding: 1rem;
        }

        .login-card {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 20px;
          padding: 2.5rem 2rem;
          width: 100%;
          max-width: 360px;
        }

        .login-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .login-icon {
          font-size: 3rem;
          display: block;
          margin-bottom: 0.5rem;
        }

        .login-header h1 {
          font-size: 1.75rem;
          font-weight: 800;
          background: linear-gradient(135deg, #f0c040, #e87e30);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 0.5rem;
        }

        .login-header p {
          font-size: 0.875rem;
          color: rgba(255,255,255,0.45);
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .login-form input {
          width: 100%;
          padding: 0.85rem 1rem;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.07);
          color: #fff;
          font-size: 1rem;
          text-align: center;
          outline: none;
          transition: border-color 0.2s;
        }

        .login-form input::placeholder {
          color: rgba(255,255,255,0.3);
          text-align: center;
        }

        .login-form input:focus {
          border-color: #f0c040;
        }

        .login-form input:disabled {
          opacity: 0.5;
        }

        .login-error {
          color: #f07070;
          font-size: 0.8rem;
          text-align: center;
          margin: 0;
        }

        .login-form button {
          width: 100%;
          padding: 0.85rem;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #f0c040, #e87e30);
          color: #1a1a2e;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.1s;
        }

        .login-form button:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
        }

        .login-form button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </main>
  )
}
