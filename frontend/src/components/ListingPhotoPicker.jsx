import { ImagePlus, X } from 'lucide-react';
import { imageUrl } from '../lib/api';

export default function ListingPhotoPicker({ images, onAddImages, onRemoveImage }) {
  return (
    <div className="field">
      <span className="field-label">Photos ({images.length}/5)</span>
      <p className="field-hint">
        Optional · PNG, JPEG or WebP · up to 2 MB each. The first image is your cover.
      </p>
      <div className="listing-photo-grid">
        {images.map((image, index) => (
          <div className="photo-preview" key={index}>
            <img
              src={image.startsWith('data:') ? image : imageUrl(image)}
              alt={'Listing photo ' + (index + 1)}
            />
            <button
              type="button"
              className="icon-button photo-remove"
              aria-label={'Remove photo ' + (index + 1)}
              onClick={() => onRemoveImage(index)}
            >
              <X size={16} />
            </button>
            <span>{index === 0 ? 'Cover' : index + 1}</span>
          </div>
        ))}
        {images.length < 5 && (
          <label className="photo-add">
            <ImagePlus size={25} />
            <span>Add photos</span>
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              onChange={onAddImages}
              aria-label="Add listing images"
            />
          </label>
        )}
      </div>
    </div>
  );
}
