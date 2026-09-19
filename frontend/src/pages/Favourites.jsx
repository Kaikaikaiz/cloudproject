import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import ListingCard from '../components/ListingCard';
import Button from '../components/Button';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
export default function Favourites() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api('/favourites');
      setListings(data.listings);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function remove(id) {
    setBusy(id);
    setError('');
    try {
      await api('/favourites/' + id, { method: 'DELETE' });
      setListings((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">YOUR RELIVE</span>
          <h1>Favourites</h1>
          <p>The active finds that caught your eye. Unavailable listings are hidden.</p>
        </div>
      </div>
      {error && (
        <div className="load-error">
          <p className="form-message error-message" role="alert">
            {error}
          </p>
          <Button onClick={load}>Try again</Button>
        </div>
      )}
      {loading ? (
        <LoadingState />
      ) : !listings.length && !error ? (
        <EmptyState
          title="Keep a little wishlist"
          description="Tap Favourite on a listing to save it here."
        />
      ) : (
        <div className="listing-grid">
          {listings.map((listing) => (
            <div key={listing.id}>
              <ListingCard listing={listing} />
              <Button
                className="remove-favourite"
                variant="ghost"
                disabled={!!busy}
                onClick={() => remove(listing.id)}
              >
                {busy === listing.id ? 'Removing…' : 'Remove favourite'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
