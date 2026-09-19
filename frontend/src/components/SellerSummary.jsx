import { Star, UserRound } from 'lucide-react';
import { imageUrl } from '../lib/api';
import { rating } from '../lib/listings';

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
        <strong>{seller.name}</strong>
        <p>
          <Star size={13} />
          {rating(seller.averageRating)} · {seller.completedTransactions} completed
          transactions
        </p>
        <small>
          {seller.city && seller.state ? seller.city + ', ' + seller.state + ' · ' : ''}
          Member since {new Date(seller.createdAt).getFullYear()}
        </small>
      </div>
    </div>
  );
}
