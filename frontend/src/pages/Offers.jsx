import { useCursorPage } from '../lib/useCursorPage';
import PageControls from '../components/PageControls';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import OfferNavigation from '../components/OfferNavigation';
import OfferCard from '../components/OfferCard';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';

export default function Offers({ direction }) {
  const { user } = useAuth();
  const page = useCursorPage(direction);
  const [offers, setOffers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);
  const isMadePage = direction === 'made';

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    setError('');

    api(
      '/offers?direction=' +
        direction +
        '&limit=20' +
        (page.cursor ? '&cursor=' + encodeURIComponent(page.cursor) : ''),
    )
      .then((data) => {
        if (isActive) {
          setOffers(data.offers);
          page.setNext(data.nextCursor);
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
  }, [direction, refreshCount, page.cursor]);

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">A LITTLE GIVE AND TAKE</span>
          <h1>{isMadePage ? 'Offers Made' : 'Offers Received'}</h1>
          <p>
            {isMadePage
              ? 'Find a price that feels right for your next favourite.'
              : 'A new chapter for the things you have loved.'}
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={isLoading}
          onClick={() => {
            page.reset();
            setRefreshCount((count) => count + 1);
          }}
        >
          Refresh
        </Button>
      </div>

      <OfferNavigation />

      {isLoading ? (
        <LoadingState label="Gathering your offers…" />
      ) : error ? (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      ) : offers.length === 0 ? (
        <EmptyState
          title={isMadePage ? 'Your next find is waiting' : 'No offers just yet'}
          description={
            isMadePage
              ? 'Make an offer on an active listing to start a negotiation.'
              : 'Offers from interested buyers will appear here.'
          }
        />
      ) : (
        <div className="offer-list">
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} userId={user.id} />
          ))}
        </div>
      )}
      <PageControls page={page} disabled={isLoading} />
    </section>
  );
}
