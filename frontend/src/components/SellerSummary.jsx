import { Star, UserRound } from 'lucide-react';
import { imageUrl } from '../lib/api';
import { rating } from '../lib/listings';
import { Link } from 'react-router-dom';

export default function SellerSummary({ seller }) {
  return (
    <div className="seller-summary">
      {seller.profileImage ? (
        <img src={imageUrl(seller.profileImage)} alt={seller.name} />
      ) : (
        <span className="seller-avatar">
          <UserRound size={25} />
        </span>
      )}
      <div>
        <Link className="auth-link" to={'/users/' + seller.id}>
          <strong>{seller.name}</strong>
        </Link>
        <p>
          <Star size={13} />
          {rating(seller.averageRating)} · {seller.totalReviews || 0} reviews ·{' '}
          {seller.completedTransactions} completed transactions
        </p>
        <small>
          {seller.city && seller.state ? seller.city + ', ' + seller.state + ' · ' : ''}
          Member since {new Date(seller.createdAt).getFullYear()}
        </small>
      </div>
    </div>
  );
}
