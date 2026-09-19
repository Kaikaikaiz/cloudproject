import { Link } from 'react-router-dom';
import { ArrowUpRight, Image, Star, MapPin } from 'lucide-react';
import { imageUrl } from '../lib/api';
import { rm, rating } from '../lib/listings';
import StatusBadge from './StatusBadge';
export default function ListingCard({ listing }) {
  return (
    <article className="listing-card">
      <Link
        to={`/listing/${listing.id}`}
        className="listing-image tone-lavender"
        aria-label={listing.title}
      >
        {listing.images[0] ? (
          <img
            className="listing-photo"
            src={imageUrl(listing.images[0].url)}
            alt={listing.title}
            loading="lazy"
          />
        ) : (
          <span className="no-photo">
            <Image size={40} strokeWidth={1.2} />
            <span>A little treasure</span>
          </span>
        )}
        <span className="listing-arrow">
          <ArrowUpRight size={18} />
        </span>
      </Link>
      <div className="listing-meta">
        <span>{listing.category}</span>
        <span className="price">{rm(listing.price)}</span>
      </div>
      <Link className="listing-title" to={`/listing/${listing.id}`}>
        {listing.title}
      </Link>
      <StatusBadge>{listing.condition}</StatusBadge>
      <p className="listing-location">
        <MapPin size={12} />
        {listing.city}, {listing.state}
      </p>
      <div className="listing-seller">
        {listing.seller.profileImage ? (
          <img className="avatar" src={imageUrl(listing.seller.profileImage)} alt="" />
        ) : (
          <span className="avatar tone-lavender">
            {listing.seller.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="seller-name">{listing.seller.name}</span>
        <span className="listing-rating">
          <Star size={11} />
          {rating(listing.seller.averageRating)}
        </span>
      </div>
    </article>
  );
}
