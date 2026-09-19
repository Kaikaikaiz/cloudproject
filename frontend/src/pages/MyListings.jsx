import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { editableStatuses, withdrawableStatuses, statusLabel } from '../lib/listings';
import ListingCard from '../components/ListingCard';
import Button from '../components/Button';
import StatusBadge from '../components/StatusBadge';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
export default function MyListings() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api('/listings/mine');
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
  async function withdraw() {
    setBusy(true);
    setError('');
    try {
      await api('/listings/' + selected.id + '/withdraw', { method: 'POST' });
      setListings((current) =>
        current.map((item) =>
          item.id === selected.id ? { ...item, status: 'WITHDRAWN' } : item,
        ),
      );
      setSelected(null);
      setNotice('Listing withdrawn. It is no longer visible in the marketplace.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">YOUR RELIVE</span>
          <h1>My Listings</h1>
          <p>Your pre-loved things, in one lovely place.</p>
        </div>
        <Button to="/sell">Sell an item ↗</Button>
      </div>
      {notice && (
        <p className="form-message success-message" role="status">
          {notice}
        </p>
      )}
      {!selected && error && (
        <div className="load-error">
          <p className="form-message error-message" role="alert">
            {error}
          </p>
          <Button onClick={load}>Try again</Button>
        </div>
      )}
      {loading ? (
        <LoadingState />
      ) : !error && !listings.length ? (
        <EmptyState
          title="Make a little room"
          description="Your first listing starts a new chapter. Pick something you are ready to pass on."
          action={false}
        />
      ) : (
        <div className="listing-grid own-listings">
          {listings.map((listing) => (
            <div key={listing.id} className="own-listing">
              <StatusBadge tone={listing.status === 'ACTIVE' ? 'mint' : 'lavender'}>
                {statusLabel(listing.status)}
              </StatusBadge>
              <ListingCard listing={listing} />
              <div className="listing-manage-actions">
                {editableStatuses.includes(listing.status) && (
                  <Button to={'/listing/' + listing.id + '/edit'} variant="secondary">
                    Edit listing
                  </Button>
                )}
                {withdrawableStatuses.includes(listing.status) && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setError('');
                      setSelected(listing);
                    }}
                  >
                    Withdraw
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal
        open={!!selected}
        onClose={() => {
          if (!busy) {
            setSelected(null);
            setError('');
          }
        }}
        title="Withdraw this listing?"
      >
        <p className="modal-copy">
          “{selected?.title}” will leave the marketplace. It will stay in My Listings as
          Withdrawn.
        </p>
        {error && (
          <p className="form-message error-message" role="alert">
            {error}
          </p>
        )}
        <div className="profile-actions">
          <Button onClick={withdraw} disabled={busy}>
            {busy ? 'Withdrawing…' : 'Withdraw listing'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setSelected(null)}>
            Keep listing
          </Button>
        </div>
      </Modal>
    </section>
  );
}
