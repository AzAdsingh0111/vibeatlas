import React, { useState } from 'react';
import './Login.css';

export default function Login({ onContinue, onLogin, onRegister, displayMode = 'page', showGuestButton = true }) {
  const [authMode, setAuthMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');

    const action = authMode === 'register' ? onRegister : onLogin;

    if (typeof action !== 'function') {
      if (typeof onContinue === 'function') onContinue();
      return;
    }

    setIsSubmitting(true);
    const payload = authMode === 'register' ? { name, email, password } : { email, password };
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
    <div className={`login-page ${displayMode === 'modal' ? 'login-page-modal' : ''}`}>
      <div className="login-box">
        {displayMode !== 'modal' && (
          <>
            <h1>Vibe Atlas</h1>
            <p>Explore your perfect vibe.</p>
          </>
        )}

        <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={`toggle-btn ${authMode === 'login' ? 'toggle-btn-active' : ''}`}
            onClick={() => {
              setAuthMode('login');
              setAuthError('');
            }}
          >
            Login
          </button>
          <button
            type="button"
            className={`toggle-btn ${authMode === 'register' ? 'toggle-btn-active' : ''}`}
            onClick={() => {
              setAuthMode('register');
              setAuthError('');
            }}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {authMode === 'register' && (
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
            {isSubmitting ? (authMode === 'register' ? 'Creating account...' : 'Logging in...') : authMode === 'register' ? 'Create account' : 'Login'}
          </button>
        </form>

        {authError && <div className="login-error">{authError}</div>}

        {showGuestButton && (
          <button type="button" className="guest-btn" onClick={onContinue} disabled={isSubmitting}>
            Continue as guest
          </button>
        )}

        <span className="footer">
          {authMode === 'register' ? 'Already have an account? Switch to login.' : 'New here? Switch to register and get started.'}
        </span>
      </div>
    </div>
  );
}
