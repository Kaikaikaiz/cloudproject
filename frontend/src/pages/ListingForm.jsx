import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { readImageFile } from '../lib/readImageFile';
import ListingPhotoPicker from '../components/ListingPhotoPicker';
import { useAuth } from '../context/AuthContext';
import { categories, conditions, editableStatuses } from '../lib/listings';
import Button from '../components/Button';
import Input from '../components/Input';
import Select from '../components/Select';
import LocationFields from '../components/LocationFields';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
export default function ListingForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [values, setValues] = useState({
    title: '',
    description: '',
    price: '',
    category: '',
    condition: '',
    state: user.state || '',
    city: user.city || '',
  });
  const [images, setImages] = useState([]);
  const [listingUpdatedAt, setListingUpdatedAt] = useState('');
  const [needsRevision, setNeedsRevision] = useState(false);
  const [moderationReason, setModerationReason] = useState('');
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState('');
  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setUnavailable('');
    setError('');
    api('/listings/' + id)
      .then(({ listing }) => {
        if (!active) return;
        if (listing.sellerId !== user.id || !editableStatuses.includes(listing.status)) {
          setUnavailable(
            'Only your own ACTIVE or NEEDS_REVISION listings can be edited.',
          );
          return;
        }
        setValues(
          Object.fromEntries(
            [
              'title',
              'description',
              'price',
              'category',
              'condition',
              'state',
              'city',
            ].map((key) => [key, listing[key]]),
          ),
        );
        setImages(listing.images.map((image) => image.url));
        setListingUpdatedAt(listing.updatedAt);
        setNeedsRevision(listing.status === 'NEEDS_REVISION');
        setModerationReason(listing.moderationReason || '');
      })
      .catch((err) => {
        if (active) setUnavailable(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, user.id]);
  function handleFieldChange(event) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
  }
  async function handleAddImages(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    setError('');
    if (images.length + files.length > 5) {
      setError('You can add up to five images. Remove an image before adding another.');
      return;
    }
    if (
      files.some(
        (file) =>
          !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
          file.size > 2 * 1024 * 1024,
      )
    ) {
      setError('Choose PNG, JPEG or WebP images, up to 2 MB each.');
      return;
    }
    setBusy(true);
    try {
      const added = await Promise.all(files.map(readImageFile));
      setImages((current) => [...current, ...added]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  function handleRemoveImage(imageIndex) {
    setImages((currentImages) =>
      currentImages.filter((image, index) => index !== imageIndex),
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    if (!values.state || !values.city.trim()) {
      setError('State and City / Area are required for a listing.');
      setBusy(false);
      return;
    }
    try {
      const { listing } = await api('/listings' + (id ? '/' + id : ''), {
        method: id ? 'PATCH' : 'POST',
        body: { ...values, images, ...(id ? { updatedAt: listingUpdatedAt } : {}) },
      });
      navigate('/listing/' + listing.id, {
        replace: true,
        state: {
          notice: needsRevision
            ? 'Your changes were submitted for review.'
            : id
              ? 'Your listing has been updated.'
              : 'Your listing is live. Give it another life!',
        },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <LoadingState label="Opening your listing…" />;
  if (unavailable)
    return <EmptyState title="This listing cannot be edited" description={unavailable} />;
  return (
    <section className="page-section listing-form-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">MAKE ROOM FOR WHAT’S NEXT</span>
          <h1>{id ? 'Edit your listing' : 'Give it another life.'}</h1>
          <p>
            {needsRevision
              ? 'Save your changes to resubmit this listing for review.'
              : 'A few little details help your item find its next home.'}
          </p>
        </div>
      </div>
      <form className="surface listing-form" onSubmit={handleSubmit}>
        {needsRevision && (
          <div className="moderation-notice">
            <strong>Your listing requires revision</strong>
            <p>{moderationReason}</p>
          </div>
        )}
        <fieldset disabled={busy}>
          <legend className="sr-only">Listing details</legend>
          <Input
            label="Title"
            name="title"
            value={values.title}
            onChange={handleFieldChange}
            required
            minLength={2}
            maxLength={120}
            placeholder="e.g. A well-loved oak bedside table"
          />
          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={values.description}
              onChange={handleFieldChange}
              required
              minLength={10}
              maxLength={5000}
              rows={6}
              placeholder="Tell its story. Include measurements, signs of wear and anything a buyer should know."
            />
          </div>
          <div className="form-grid">
            <Input
              label="Price (RM)"
              name="price"
              type="number"
              value={values.price}
              onChange={handleFieldChange}
              required
              min="0"
              max="999999.99"
              step="0.01"
            />
            <Select
              label="Category"
              name="category"
              value={values.category}
              onChange={handleFieldChange}
              options={categories}
              required
            />
            <Select
              label="Condition"
              name="condition"
              value={values.condition}
              onChange={handleFieldChange}
              options={conditions}
              required
            />
          </div>
          <LocationFields values={values} onChange={handleFieldChange} />
          <small>
            State and City / Area are required. Enter the Malaysian area where the item is
            located.
          </small>
          <ListingPhotoPicker
            images={images}
            onAddImages={handleAddImages}
            onRemoveImage={handleRemoveImage}
          />
        </fieldset>
        {error && (
          <p className="form-message error-message" role="alert">
            {error}
          </p>
        )}
        <div className="profile-actions">
          <Button type="submit" disabled={busy}>
            {busy
              ? 'Saving…'
              : needsRevision
                ? 'Resubmit for Review'
                : id
                  ? 'Save changes'
                  : 'Publish listing'}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => navigate('/my-listings')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
