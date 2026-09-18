import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingState from '../components/LoadingState';
import Input from '../components/Input';
import Button from '../components/Button';
import StatusBadge from '../components/StatusBadge';
export default function Auth({ register = false }) {
 const { user, loading, authenticate } = useAuth(); const location = useLocation();
 const [values, setValues] = useState({ name:'', email:'', password:'', confirm:'' });
 const [busy, setBusy] = useState(false); const [error, setError] = useState('');
 const destination = location.state?.from;
 const from = typeof destination === 'string' && destination.startsWith('/') && !destination.startsWith('//') ? destination : '/profile';
 function change(e) { setValues(current => ({ ...current, [e.target.name]: e.target.value })); }
 async function submit(e) {
  e.preventDefault(); setError('');
  if (register && values.password !== values.confirm) { setError('The passwords do not match.'); return; }
  setBusy(true);
  try { await authenticate(register ? 'register' : 'login', { email:values.email, password:values.password, ...(register ? {name:values.name} : {}) }); }
  catch(err) { setError(err.message); } finally { setBusy(false); }
 }
 if (loading) return <LoadingState label="Checking your session…"/>;
 if (user) return <Navigate to={from} replace/>;
 return <section className="auth-page"><div className="auth-card"><StatusBadge tone="lavender">{register ? 'Join the community' : 'Your little corner'}</StatusBadge><h1>{register ? 'Your next chapter.' : 'Welcome back.'}</h1><p>{register ? 'Good finds and fresh beginnings await.' : 'Your favourite finds missed you.'}</p><form onSubmit={submit}>
 {register && <Input label="Your name" name="name" placeholder="How should we call you?" autoComplete="name" value={values.name} onChange={change} minLength={2} maxLength={80} required disabled={busy}/>}
 <Input label="Email address" name="email" type="email" placeholder="you@example.com" autoComplete="email" value={values.email} onChange={change} maxLength={254} required disabled={busy}/>
 <Input label="Password" name="password" type="password" placeholder="Your password" autoComplete={register ? 'new-password' : 'current-password'} value={values.password} onChange={change} minLength={10} maxLength={128} required disabled={busy} hint={register ? 'Use 10–128 characters.' : undefined}/>
 {register && <Input label="Confirm password" name="confirm" type="password" autoComplete="new-password" value={values.confirm} onChange={change} required disabled={busy}/>}
 {!register && <Link className="auth-link" to="/forgot-password">Forgot password?</Link>}
 {error && <p className="form-message error-message" role="alert">{error}</p>}
 <Button type="submit" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Log in'}</Button></form><p className="auth-switch">{register ? 'Already part of the community?' : 'New around here?'} <Link state={location.state} to={register ? '/login' : '/register'}>{register ? 'Log in' : 'Join reLIVE'}</Link></p></div></section>;
}
