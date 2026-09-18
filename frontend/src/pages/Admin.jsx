import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import Button from '../components/Button';
export default function Admin() {
 const [status, setStatus] = useState('loading'); const [error, setError] = useState('');
 async function check() { setStatus('loading'); try { await api('/auth/admin'); setStatus('ready'); } catch(err) { setError(err.message); setStatus('error'); } }
 useEffect(() => { check(); }, []);
 if (status === 'loading') return <LoadingState label="Checking administrator access…"/>;
 if (status === 'error') return <div className="empty-state"><p role="alert">{error}</p><Button onClick={check}>Try again</Button></div>;
 return <section className="page-section"><h1>Admin workspace</h1><div className="surface"><EmptyState title="Welcome, administrator" description="Your administrator access is verified. Marketplace management tools are coming later."/></div></section>;
}
