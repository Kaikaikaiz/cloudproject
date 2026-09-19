import { useState } from 'react';
import { Image } from 'lucide-react';
import { imageUrl } from '../lib/api';

export default function ListingGallery({ listing }) {
  const [selected, setSelected] = useState(0);

  return (
    <div className="listing-gallery">
      <div className="detail-image tone-lavender">
        {listing.images.length ? (
          <img
            src={imageUrl(listing.images[selected]?.url || listing.images[0].url)}
            alt={listing.title + ' — photo ' + (selected + 1)}
          />
        ) : (
          <span className="no-photo">
            <Image size={60} strokeWidth={1} />
            <span>No photos added yet</span>
          </span>
        )}
      </div>
      {listing.images.length > 1 && (
        <div className="gallery-thumbnails">
          {listing.images.map((image, index) => (
            <button
              type="button"
              key={image.id}
              aria-label={'View photo ' + (index + 1)}
              aria-pressed={selected === index}
              className={selected === index ? 'selected' : ''}
              onClick={() => setSelected(index)}
            >
              <img src={imageUrl(image.url)} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
