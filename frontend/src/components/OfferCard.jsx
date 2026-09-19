import { Link } from 'react-router-dom';
import { Image } from 'lucide-react';
import { imageUrl } from '../lib/api';
import { rm, statusLabel } from '../lib/listings';
import { getOfferMessage } from '../lib/offers';
import StatusBadge from './StatusBadge';

export default function OfferCard({ offer, userId }) {
  const isBuyer = offer.buyerId === userId;
  const participant = isBuyer ? offer.seller : offer.buyer;
  const cover = offer.listing.images[0];
  const isYourTurn = offer.allowedActions.includes('accept');

  return (
    <article className="offer-card surface">
      <Link
        className="offer-cover"
        to={'/offers/' + offer.id}
        tabIndex={-1}
        aria-hidden="true"
      >
        {cover ? (
          <img src={imageUrl(cover.url)} alt="" />
        ) : (
          <Image size={32} strokeWidth={1.3} />
        )}
      </Link>

      <div className="offer-card-content">
        <div className="offer-card-heading">
          <Link className="offer-title" to={'/offers/' + offer.id}>
            {offer.listing.title}
          </Link>
          <StatusBadge tone={offer.status === 'ACCEPTED' ? 'mint' : 'lavender'}>
            {statusLabel(offer.status)}
          </StatusBadge>
        </div>

        <p>
          {isBuyer ? 'Seller' : 'Buyer'}: {participant.name}
        </p>
        <p className="offer-card-price">
          {rm(offer.currentAmount)}
          <span>Original asking price: {rm(offer.originalPrice)}</span>
        </p>
        <p className={isYourTurn ? 'offer-turn' : 'offer-waiting'}>
          {getOfferMessage(offer, userId)}
        </p>

        <Link className="auth-link" to={'/offers/' + offer.id}>
          {isYourTurn ? 'Respond to offer' : 'View negotiation'} →
        </Link>
      </div>
    </article>
  );
}
