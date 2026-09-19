import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import Input from '../components/Input';
import Button from '../components/Button';
import StatusBadge from '../components/StatusBadge';
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await api('/auth/forgot-password', {
        method: 'POST',
        body: { email },
      });
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-page">
      <div className="auth-card">
        <StatusBadge tone="lavender">Local preview</StatusBadge>
        <h1>A fresh start.</h1>
        <p>
          Forgot your password? This local mock records no reset token and sends no email.
          Your password will stay unchanged.
        </p>
        <form onSubmit={submit}>
          <Input
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            maxLength={254}
            disabled={busy}
          />
          {error && (
            <p className="form-message error-message" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="form-message success-message" role="status">
              {message}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Request password help'}
          </Button>
        </form>
        <Link className="auth-link" to="/login">
          Back to log in
        </Link>
      </div>
    </section>
  );
}
