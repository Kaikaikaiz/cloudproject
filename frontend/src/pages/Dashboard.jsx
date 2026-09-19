import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Heart, Landmark, ReceiptText, ShoppingBag, Tag } from 'lucide-react';
import { api } from '../lib/api';
import { rm } from '../lib/listings';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';

const cards = [
  ['Active Listings', 'activeListings', '/my-listings', Tag],
  ['Reserved Listings', 'reservedListings', '/my-listings', Tag],
  ['Sold Items', 'soldItems', '/my-listings', ReceiptText],
  ['Offers Made', 'offersMade', '/my-offers/made', ShoppingBag],
  ['Offers Received', 'offersReceived', '/my-offers/received', ShoppingBag],
  ['Purchases', 'purchases', '/my-purchases', ReceiptText],
  ['Sales', 'sales', '/my-sales', ReceiptText],
  ['Favourites', 'favourites', '/favourites', Heart],
  ['Listings Needing Revision', 'needsRevision', '/my-listings', Bell],
];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true); setError('');
    try { setData(await api('/dashboard')); } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function markRead() {
    try { await api('/dashboard/notifications/read', { method: 'POST' }); setData((current) => ({ ...current, unreadNotifications: 0, notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })) })); }
    catch (err) { setError(err.message); }
  }
  if (loading) return <LoadingState label="Loading your reLIVE dashboard…" />;
  if (error && !data) return <section className="page-section"><EmptyState title="Your dashboard is taking a moment" description={error} action={false} /><Button onClick={load}>Try again</Button></section>;
  return <section className="page-section">
    <div className="page-heading"><div><span className="eyebrow muted">YOUR RELIVE</span><h1>Dashboard</h1><p>A calm overview of what you’re selling, finding and keeping in motion.</p></div><Button to="/sell">Sell an item</Button></div>
    {error && <p className="form-message error-message" role="alert">{error}</p>}
    <div className="dashboard-wallet surface"><Landmark size={25} /><div><span>Wallet Balance</span><strong>{rm(data.walletBalance)}</strong></div><Button to="/wallet" variant="secondary">Open wallet</Button></div>
    <div className="dashboard-grid">{cards.map(([label, key, to, Icon]) => <Link className={'surface dashboard-card' + (key === 'needsRevision' && data.counts[key] ? ' needs-attention' : '')} to={to} key={key}><Icon size={20}/><span>{label}</span><strong>{data.counts[key]}</strong></Link>)}</div>
    <section className="surface dashboard-notifications"><div className="transaction-card-heading"><div><h2>Notifications {data.unreadNotifications ? `(${data.unreadNotifications})` : ''}</h2><p>Offer updates and listing moderation notices.</p></div>{data.unreadNotifications > 0 && <Button variant="ghost" onClick={markRead}>Mark all read</Button>}</div>{data.notifications.length ? <div className="notification-list">{data.notifications.map((item) => <Link key={item.id} to={item.link || '/dashboard'} className={item.readAt ? 'notification' : 'notification unread'}><strong>{item.message}</strong><small>{new Date(item.createdAt).toLocaleString('en-MY')}</small></Link>)}</div> : <EmptyState title="You’re all caught up" description="New offers and moderation updates will appear here." action={false}/>}</section>
  </section>;
}
