import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { api } from '../lib/api';
import { rm } from '../lib/listings';
import Button from '../components/Button';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';

export default function Transactions({ direction }) {
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);
  const isSales = direction === 'sales';

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    setError('');

    api('/transactions?direction=' + direction)
      .then((data) => {
        if (isActive) setTransactions(data.transactions);
      })
      .catch((requestError) => {
        if (isActive) setError(requestError.message);
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [direction, refreshCount]);

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">ANOTHER LIFE, A NEW CHAPTER</span>
          <h1>{isSales ? 'My Sales' : 'My Purchases'}</h1>
          <p>Your completed trades and the people behind them.</p>
        </div>
        <Button
          variant="secondary"
          disabled={isLoading}
          onClick={() => setRefreshCount((count) => count + 1)}
        >
          Refresh
        </Button>
      </div>
      <nav className="history-navigation" aria-label="Transaction history">
        <NavLink to="/my-purchases">My Purchases</NavLink>
        <NavLink to="/my-sales">My Sales</NavLink>
      </nav>
      {isLoading ? (
        <LoadingState label="Loading your history…" />
      ) : error ? (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      ) : transactions.length === 0 ? (
        <EmptyState
          title={isSales ? 'Your first sale is ahead' : 'Your next find is waiting'}
          description="Completed transactions will appear here, ready for your review."
        />
      ) : (
        <div className="transaction-list">
          {transactions.map((transaction) => {
            const participant = isSales ? transaction.buyer : transaction.seller;

            return (
              <article className="surface transaction-card" key={transaction.id}>
                <div className="transaction-card-heading">
                  <h2>{transaction.purchase.listingTitle}</h2>
                  <StatusBadge>Completed</StatusBadge>
                </div>
                <p>
                  {isSales ? 'Buyer' : 'Seller'}:{' '}
                  <Link className="auth-link" to={'/users/' + participant.id}>
                    {participant.name}
                  </Link>
                </p>
                <p className="transaction-date">
                  {new Date(transaction.createdAt).toLocaleString('en-MY')}
                </p>
                <dl className="payment-details">
                  <div>
                    <dt>Original price</dt>
                    <dd>{rm(transaction.originalPrice)}</dd>
                  </div>
                  <div>
                    <dt>Final price</dt>
                    <dd>{rm(transaction.finalPrice)}</dd>
                  </div>
                </dl>
                <div className="profile-actions">
                  <Button to={'/transactions/' + transaction.id} variant="secondary">
                    {transaction.canReview ? 'View & leave a review' : 'View transaction'}
                  </Button>
                  <Link className="auth-link" to={'/purchases/' + transaction.purchaseId}>
                    Payment receipt
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
