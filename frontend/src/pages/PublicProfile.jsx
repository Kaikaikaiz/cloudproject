import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { api, imageUrl } from '../lib/api';
import Button from '../components/Button';
import LoadingState from '../components/LoadingState';
import Reputation from '../components/Reputation';

export default function PublicProfile() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    setError('');
    api('/users/' + id)
      .then((result) => {
        if (isActive) setData(result);
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

  if (isLoading) return <LoadingState label="Loading community profile…" />;
  if (error)
    return (
      <section className="page-section">
        <p className="form-message error-message" role="alert">
          {error}
        </p>
        <Button onClick={() => setRefreshCount((count) => count + 1)}>Try again</Button>
      </section>
    );

  const { user, reviews } = data;

  return (
    <section className="page-section public-profile">
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">THE RELIVE COMMUNITY</span>
          <h1>{user.name}</h1>
        </div>
      </div>
      <div className="surface profile-surface">
        <div className="profile-top">
          <div className="profile-photo">
            {user.profileImage ? (
              <img src={imageUrl(user.profileImage)} alt={user.name} />
            ) : (
              <UserRound size={50} />
            )}
          </div>
          <div className="profile-identity">
            <h2>{user.name}</h2>
            <p>
              {[user.city, user.state].filter(Boolean).join(', ') || 'Location not added'}
            </p>
            <small>
              Member since{' '}
              {new Date(user.createdAt).toLocaleDateString('en-MY', {
                month: 'long',
                year: 'numeric',
              })}
            </small>
          </div>
        </div>
        <Reputation user={user} />
      </div>
      <section className="surface public-reviews">
        <h2>Community reviews</h2>
        <p>Reviews from completed transactions.</p>
        {reviews.length === 0 && (
          <p>No reviews yet. Every good exchange starts somewhere.</p>
        )}
        {reviews.map((review) => (
          <article className="review-card" key={review.id}>
            <div className="transaction-card-heading">
              <Link className="auth-link" to={'/users/' + review.reviewer.id}>
                {review.reviewer.name}
              </Link>
              <strong
                className="rating-stars"
                aria-label={review.rating + ' out of 5 stars'}
              >
                {'★'.repeat(review.rating)}
                {'☆'.repeat(5 - review.rating)}
              </strong>
            </div>
            {review.comment && <p className="review-text">{review.comment}</p>}
            <small>{new Date(review.createdAt).toLocaleDateString('en-MY')}</small>
          </article>
        ))}
      </section>
    </section>
  );
}
