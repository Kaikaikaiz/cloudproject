import { useEffect, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { api, imageUrl } from '../lib/api';
import { rm } from '../lib/listings';
import { withReturnPath } from '../lib/payments';
import Button from '../components/Button';
import LoadingState from '../components/LoadingState';
import StatusBadge from '../components/StatusBadge';

export default function Checkout() {
  const { listingId } = useParams();
  const [searchParams] = useSearchParams();
  const offerId = searchParams.get('offer') || null;
  const location = useLocation();
  const navigate = useNavigate();
  const [checkout, setCheckout] = useState(null);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);
  const returnTo = location.pathname + location.search;

  useEffect(() => {
    let isActive = true;
    const query = new URLSearchParams({ listingId });

    if (offerId) {
      query.set('offerId', offerId);
    }

    setIsLoading(true);
    setError('');

    api('/purchases/quote?' + query)
      .then((data) => {
        if (isActive) {
          setCheckout(data.checkout);
        }
      })
      .catch((requestError) => {
        if (isActive) {
          setCheckout(null);
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
  }, [listingId, offerId, refreshCount]);

  async function handlePurchase() {
    setIsSubmitting(true);
    setError('');

    try {
      const { purchase } = await api('/purchases', {
        method: 'POST',
        body: {
          listingId,
          offerId,
          requestKey,
          expectedAmount: checkout.amount,
          listingUpdatedAt: checkout.listingUpdatedAt,
        },
      });

      navigate('/purchases/' + purchase.id + '/success', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <LoadingState label="Checking your purchase…" />;
  }

  return (
    <section className="page-section payment-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">ANOTHER LIFE STARTS HERE</span>
          <h1>Confirm purchase</h1>
          <p>A little check before this find becomes yours.</p>
        </div>
      </div>

      <div className="surface payment-panel">
        <StatusBadge tone="lavender">Demo wallet payment</StatusBadge>

        {checkout && (
          <>
            <div className="checkout-item">
              {checkout.listing.images[0] && (
                <img
                  src={imageUrl(checkout.listing.images[0].url)}
                  alt={checkout.listing.title}
                />
              )}
              <div>
                <h2>{checkout.listing.title}</h2>
                <p>Sold by {checkout.listing.seller.name}</p>
              </div>
            </div>

            <dl className="payment-details">
              <div>
                <dt>{offerId ? 'Final agreed price' : 'Asking price'}</dt>
                <dd>{rm(checkout.amount)}</dd>
              </div>
              <div>
                <dt>Payment method</dt>
                <dd>reLIVE Wallet</dd>
              </div>
              <div>
                <dt>Current balance</dt>
                <dd>{rm(checkout.balance)}</dd>
              </div>
              <div className="payment-remaining">
                <dt>
                  {checkout.sufficientBalance
                    ? 'Balance after purchase'
                    : 'Amount to top up'}
                </dt>
                <dd>{rm(Math.abs(checkout.balance - checkout.amount))}</dd>
              </div>
            </dl>

            <p className="payment-mock-notice">
              This uses demo wallet funds only. No real money is moved.
            </p>

            {checkout.sufficientBalance ? (
              <Button disabled={isSubmitting} onClick={handlePurchase}>
                {isSubmitting
                  ? 'Processing purchase…'
                  : 'Pay ' + rm(checkout.amount) + ' with wallet'}
              </Button>
            ) : (
              <>
                <p className="form-message error-message" role="status">
                  Your wallet needs a little top-up before you can pay.
                </p>
                <Button to={withReturnPath('/wallet/top-up', returnTo)}>
                  Top up wallet
                </Button>
              </>
            )}
          </>
        )}

        {error && (
          <div className="load-error">
            <p className="form-message error-message" role="alert">
              {error}
            </p>
            <Button
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => setRefreshCount((count) => count + 1)}
            >
              Refresh checkout
            </Button>
          </div>
        )}

        <p className="payment-help">
          If a response was interrupted, check your wallet history for a receipt. Retrying
          the same payment will not charge you twice.
        </p>
        <Link className="auth-link" to="/wallet">
          View wallet and receipts
        </Link>
      </div>
    </section>
  );
}
