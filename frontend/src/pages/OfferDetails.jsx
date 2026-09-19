import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { rm, statusLabel } from '../lib/listings';
import { getOfferMessage } from '../lib/offers';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import LoadingState from '../components/LoadingState';
import OfferNavigation from '../components/OfferNavigation';
import OfferTimeline from '../components/OfferTimeline';
import OfferActions from '../components/OfferActions';
import StatusBadge from '../components/StatusBadge';

export default function OfferDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const [offer, setOffer] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    setError('');

    api('/offers/' + id)
      .then((data) => {
        if (isActive) {
          setOffer(data.offer);
        }
      })
      .catch((requestError) => {
        if (isActive) {
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [id, refreshCount]);

  if (isLoading) {
    return <LoadingState label="Opening your negotiation…" />;
  }

  if (error) {
    return (
      <section className="page-section">
        <OfferNavigation />
        <p className="form-message error-message" role="alert">
          {error}
        </p>
        <Button onClick={() => setRefreshCount((count) => count + 1)}>Try again</Button>
      </section>
    );
  }

  const isBuyer = user.id === offer.buyerId;
  const participant = isBuyer ? offer.seller : offer.buyer;
  const canViewListing = offer.listing.status === 'ACTIVE' || !isBuyer;

  return (
    <section className="page-section offer-details-page">
      <OfferNavigation />

      <div className="page-heading">
        <div>
          <span className="eyebrow muted">ONE FIND, A FAIR PRICE</span>
          <h1>Offer Details</h1>
          <p>
            {isBuyer ? 'Negotiating with seller ' : 'Negotiating with buyer '}
            {participant.name}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setRefreshCount((count) => count + 1)}>
          Refresh
        </Button>
      </div>

      <div className="surface offer-details-summary">
        <div className="offer-card-heading">
          <h2>{offer.listing.title}</h2>
          <StatusBadge tone={offer.status === 'ACCEPTED' ? 'mint' : 'lavender'}>
            {statusLabel(offer.status)}
          </StatusBadge>
        </div>

        <p>
          {offer.listing.city}, {offer.listing.state}
        </p>

        <dl className="offer-prices">
          <div>
            <dt>Original asking price</dt>
            <dd>{rm(offer.originalPrice)}</dd>
          </div>
          <div>
            <dt>{offer.agreedPrice === null ? 'Current offer' : 'Final agreed price'}</dt>
            <dd>{rm(offer.agreedPrice ?? offer.currentAmount)}</dd>
          </div>
        </dl>

        <p className="offer-state-message" role="status">
          {getOfferMessage(offer, user.id)}
        </p>

        {offer.status === 'ACCEPTED' &&
          (isBuyer ? (
            <div className="profile-actions">
              <Button to={'/checkout/' + offer.listingId + '?offer=' + offer.id}>
                Pay {rm(offer.agreedPrice)} with wallet
              </Button>
            </div>
          ) : (
            <p className="field-hint">Waiting for the buyer to pay the agreed amount.</p>
          ))}

        {offer.purchase && (
          <div className="profile-actions">
            <Button to={'/purchases/' + offer.purchase.id} variant="secondary">
              View payment receipt
            </Button>
          </div>
        )}

        {canViewListing && (
          <Link className="auth-link" to={'/listing/' + offer.listingId}>
            View listing →
          </Link>
        )}

        {offer.allowedActions.length > 0 && (
          <OfferActions
            key={offer.id + ':' + offer.version}
            offer={offer}
            onUpdate={setOffer}
          />
        )}
      </div>

      <OfferTimeline offer={offer} />
    </section>
  );
}
