import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Heart, Image, MapPin, Star, UserRound } from 'lucide-react';
import { api, imageUrl } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { rm, rating, statusLabel, editableStatuses } from '../lib/listings';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import Button from '../components/Button';
import Modal from '../components/Modal';
export default function ListingDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [selected, setSelected] = useState(0);
  const [favourite, setFavourite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState('');
  const [retry, setRetry] = useState(0);
  const [favouriteReady, setFavouriteReady] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setSelected(0);
    api('/listings/' + id)
      .then((data) => {
        if (active) setListing(data.listing);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, user?.id, retry]);
  useEffect(() => {
    let active = true;
    setFavourite(false);
    setActionError('');
    setFavouriteReady(!user);
    if (user)
      api('/favourites/' + id)
        .then((data) => {
          if (active) {
            setFavourite(data.favourite);
            setFavouriteReady(true);
          }
        })
        .catch((err) => {
          if (active) setActionError(err.message);
        });
    return () => {
      active = false;
    };
  }, [id, user?.id, retry]);
  const owner = user?.id === listing?.sellerId;
  function buyerAction(action) {
    if (owner || listing.status !== 'ACTIVE') return;
    if (!user) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    setDialog(action);
  }
  async function toggleFavourite() {
    if (owner || listing.status !== 'ACTIVE') return;
    if (!user) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      const data = await api('/favourites/' + id, {
        method: favourite ? 'DELETE' : 'PUT',
      });
      setFavourite(data.favourite);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <LoadingState label="Finding your next treasure…" />;
  if (error)
    return (
      <div className="empty-state">
        <EmptyState title="This find isn’t available" description={error} />
        <Button onClick={() => setRetry((value) => value + 1)}>Try again</Button>
      </div>
    );
  if (!listing) return null;
  const disabled = owner || listing.status !== 'ACTIVE';
  return (
    <section className="page-section">
      <Link className="back-link" to="/">
        <ArrowLeft size={16} /> Back to the marketplace
      </Link>
      {location.state?.notice && (
        <p className="form-message success-message listing-notice" role="status">
          {location.state.notice}
        </p>
      )}
      <div className="detail-grid live-detail-grid">
        <div className="listing-gallery">
          <div className="detail-image tone-lavender">
            {listing.images.length ? (
              <img
                src={imageUrl(listing.images[selected]?.url || listing.images[0].url)}
                alt={listing.title + ' — photo ' + (selected + 1)}
              />
            ) : (
              <span className="no-photo">
                <Image size={60} strokeWidth={1} />
                <span>No photos added yet</span>
              </span>
            )}
          </div>
          {listing.images.length > 1 && (
            <div className="gallery-thumbnails">
              {listing.images.map((image, index) => (
                <button
                  type="button"
                  key={image.id}
                  aria-label={'View photo ' + (index + 1)}
                  aria-pressed={selected === index}
                  className={selected === index ? 'selected' : ''}
                  onClick={() => setSelected(index)}
                >
                  <img src={imageUrl(image.url)} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="detail-copy">
          <StatusBadge tone={listing.status === 'ACTIVE' ? 'mint' : 'lavender'}>
            {statusLabel(listing.status)}
          </StatusBadge>
          <p className="eyebrow muted">{listing.category}</p>
          <h1>{listing.title}</h1>
          <p className="detail-price">{rm(listing.price)}</p>
          <StatusBadge>{listing.condition}</StatusBadge>
          <p className="detail-location">
            <MapPin size={16} />
            {listing.city}, {listing.state}, Malaysia
          </p>
          <h2 className="detail-subheading">A little about this find</h2>
          <p className="listing-description">{listing.description}</p>
          <small>Listed {new Date(listing.createdAt).toLocaleDateString('en-MY')}</small>
          <div className="seller-summary">
            {listing.seller.profileImage ? (
              <img
                src={imageUrl(listing.seller.profileImage)}
                alt={listing.seller.name}
              />
            ) : (
              <span className="seller-avatar">
                <UserRound size={25} />
              </span>
            )}
            <div>
              <strong>{listing.seller.name}</strong>
              <p>
                <Star size={13} />
                {rating(listing.seller.averageRating)} ·{' '}
                {listing.seller.completedTransactions} completed transactions
              </p>
              <small>
                {listing.seller.city && listing.seller.state
                  ? listing.seller.city + ', ' + listing.seller.state + ' · '
                  : ''}
                Member since {new Date(listing.seller.createdAt).getFullYear()}
              </small>
            </div>
          </div>
          <div className="buyer-actions">
            <Button disabled={disabled} onClick={() => buyerAction('Make Offer')}>
              Make Offer
            </Button>
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => buyerAction('Buy Now')}
            >
              Buy Now
            </Button>
            <Button
              variant="ghost"
              disabled={disabled || busy || !favouriteReady}
              onClick={toggleFavourite}
              aria-pressed={favourite}
            >
              <Heart size={17} fill={favourite ? 'currentColor' : 'none'} />
              {busy ? 'Saving…' : favourite ? 'Favourited' : 'Favourite'}
            </Button>
          </div>
          {owner ? (
            <>
              <small>
                This is your listing. You cannot buy, make offers on, or favourite your
                own item.
              </small>
              <div className="profile-actions">
                {editableStatuses.includes(listing.status) && (
                  <Button to={'/listing/' + id + '/edit'} variant="secondary">
                    Edit listing
                  </Button>
                )}
                <Button to="/my-listings" variant="ghost">
                  Manage my listings
                </Button>
              </div>
            </>
          ) : (
            <small>
              Offers and purchases are coming soon. Saving favourites is available now.
            </small>
          )}
          {actionError && (
            <div className="load-error">
              <p className="form-message error-message" role="alert">
                {actionError}
              </p>
              <Button variant="ghost" onClick={() => setRetry((value) => value + 1)}>
                Retry
              </Button>
            </div>
          )}
        </div>
      </div>
      <Modal
        open={!!dialog}
        onClose={() => setDialog('')}
        title={dialog + ' · coming soon'}
      >
        <p className="modal-copy">
          {dialog === 'Make Offer'
            ? 'You’ll soon be able to send the seller an offer for this find.'
            : 'You’ll soon be able to buy this find through reLIVE.'}{' '}
          No offer, purchase, reservation or payment has been made.
        </p>
        <Button onClick={() => setDialog('')}>Got it</Button>
      </Modal>
    </section>
  );
}
