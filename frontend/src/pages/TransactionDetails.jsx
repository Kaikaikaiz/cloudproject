import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { rm } from '../lib/listings';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import LoadingState from '../components/LoadingState';
import StatusBadge from '../components/StatusBadge';
import ReviewForm from '../components/ReviewForm';

export default function TransactionDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const [transaction, setTransaction] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    setError('');
    api('/transactions/' + id)
      .then((data) => {
        if (isActive) setTransaction(data.transaction);
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
  }, [id, refreshCount]);

  if (isLoading) return <LoadingState label="Loading transaction…" />;

  if (error) {
    return (
      <section className="page-section">
        <p className="form-message error-message" role="alert">
          {error}
        </p>
        <Button onClick={() => setRefreshCount((count) => count + 1)}>Try again</Button>
      </section>
    );
  }

  const isBuyer = user.id === transaction.buyerId;
  const participant = isBuyer ? transaction.seller : transaction.buyer;

  function handleReviewSaved() {
    setNotice('Thank you! Your review has been published.');
    setRefreshCount((count) => count + 1);
  }

  return (
    <section className="page-section payment-page">
      <div className="page-heading">
        <div>
          <h1>Transaction details</h1>
          <p>{transaction.purchase.listingTitle}</p>
        </div>
        <Button variant="secondary" onClick={() => setRefreshCount((count) => count + 1)}>
          Refresh
        </Button>
      </div>
      <div className="surface payment-panel">
        <StatusBadge>Completed</StatusBadge>
        <p>
          {isBuyer ? 'Seller' : 'Buyer'}:{' '}
          <Link className="auth-link" to={'/users/' + participant.id}>
            {participant.name}
          </Link>
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
          <div>
            <dt>Completed</dt>
            <dd>{new Date(transaction.createdAt).toLocaleString('en-MY')}</dd>
          </div>
        </dl>
        <div className="profile-actions">
          <Button to={'/purchases/' + transaction.purchaseId} variant="secondary">
            Payment receipt
          </Button>
          <Button to={isBuyer ? '/my-purchases' : '/my-sales'} variant="ghost">
            Back to history
          </Button>
        </div>
        {notice && (
          <p className="form-message success-message" role="status">
            {notice}
          </p>
        )}
        {transaction.canReview && (
          <ReviewForm
            transactionId={id}
            participantName={participant.name}
            onSaved={handleReviewSaved}
          />
        )}
        <section className="transaction-reviews">
          <h2>Reviews</h2>
          {transaction.reviews.length === 0 && <p>No reviews yet.</p>}
          {transaction.reviews.map((review) => (
            <article className="review-card" key={review.id}>
              <strong>
                {review.reviewerId === user.id
                  ? 'Your review'
                  : participant.name + '’s review'}{' '}
                · {review.rating} / 5 ★
              </strong>
              {review.comment && <p className="review-text">{review.comment}</p>}
              <small>{new Date(review.createdAt).toLocaleDateString('en-MY')}</small>
            </article>
          ))}
        </section>
      </div>
    </section>
  );
}
