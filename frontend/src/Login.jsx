import React, { useState } from 'react';
import './Login.css';

export default function Login({ onContinue, onLogin, onRegister }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');

    const action = mode === 'register' ? onRegister : onLogin;

    if (typeof action !== 'function') {
      if (typeof onContinue === 'function') onContinue();
      return;
    }

    setIsSubmitting(true);
    const payload = mode === 'register' ? { name, email, password } : { email, password };
    const result = await action(payload);
    setIsSubmitting(false);

    if (result?.ok) {
      if (typeof onContinue === 'function') onContinue();
      return;
    }

    if (result?.error) {
      setAuthError(result.error);
    } else {
      setAuthError('Authentication failed. Please try again.');
    }
  };

  return (
    <div className="login-page">
      <div className="login-box">
        <h1>Vibe Atlas</h1>
        <p>Explore your perfect vibe.</p>

        <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={`toggle-btn ${mode === 'login' ? 'toggle-btn-active' : ''}`}
            onClick={() => {
              setMode('login');
              setAuthError('');
            }}
          >
            Login
          </button>
          <button
            type="button"
            className={`toggle-btn ${mode === 'register' ? 'toggle-btn-active' : ''}`}
            onClick={() => {
              setMode('register');
              setAuthError('');
            }}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (mode === 'register' ? 'Creating account...' : 'Logging in...') : mode === 'register' ? 'Create account' : 'Login'}
          </button>
        </form>

        {authError && <div className="login-error">{authError}</div>}

        <button type="button" className="guest-btn" onClick={onContinue} disabled={isSubmitting}>
          Continue as guest
        </button>

        <span className="footer">
          {mode === 'register' ? 'Already have an account? Switch to login.' : 'New here? Switch to register and get started.'}
        </span>
      </div>
    </div>
  );
}
