import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Heart, MapPin } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { rm, statusLabel, editableStatuses } from '../lib/listings';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import Button from '../components/Button';
import ListingGallery from '../components/ListingGallery';
import SellerSummary from '../components/SellerSummary';
import MakeOfferModal from '../components/MakeOfferModal';
import ReportListing from '../components/ReportListing';
import ModerationNotice from '../components/ModerationNotice';
export default function ListingDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [favourite, setFavourite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState('');
  const [retry, setRetry] = useState(0);
  const [favouriteReady, setFavouriteReady] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
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
    if (user && user.role !== 'ADMIN')
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
  const isOwner = user?.id === listing?.sellerId;
  function openBuyerActionDialog(action) {
    if (isOwner || listing.status !== 'ACTIVE') return;
    if (!user) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    if (action === 'Buy Now') {
      navigate('/checkout/' + listing.id);
      return;
    }
    setDialog(action);
  }
  async function toggleFavourite() {
    if (isOwner || listing.status !== 'ACTIVE') return;
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
  const disabled = isOwner || user?.role === 'ADMIN' || listing.status !== 'ACTIVE';
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
        <ListingGallery key={listing.id} listing={listing} />
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
          <SellerSummary seller={listing.seller} />
          {isOwner && <ModerationNotice listing={listing} />}
          {!isOwner && user?.role === 'USER' && listing.status === 'ACTIVE' && (
            <ReportListing key={listing.id} listingId={listing.id} />
          )}
          <div className="buyer-actions">
            <Button
              disabled={disabled}
              onClick={() => openBuyerActionDialog('Make Offer')}
            >
              Make Offer
            </Button>
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => openBuyerActionDialog('Buy Now')}
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
          {isOwner ? (
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
              Make an offer or buy this find now using your reLIVE demo wallet.
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
      <MakeOfferModal
        listing={listing}
        open={dialog === 'Make Offer'}
        onClose={() => setDialog('')}
      />
    </section>
  );
}
