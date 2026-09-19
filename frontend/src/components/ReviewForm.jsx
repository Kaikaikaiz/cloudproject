import { useState } from 'react';
import { api } from '../lib/api';
import Button from './Button';

export default function ReviewForm({ transactionId, participantName, onSaved }) {
  const [rating, setRating] = useState('');
  const [comment, setComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setError('');

    try {
      await api('/transactions/' + transactionId + '/reviews', {
        method: 'POST',
        body: { rating: Number(rating), comment },
      });
      onSaved();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="review-form" onSubmit={handleSubmit}>
      <h2>Review {participantName}</h2>
      <p>
        Share your experience of this completed transaction. You can leave one review.
      </p>
      <fieldset className="review-rating" disabled={isSaving}>
        <legend>Rating</legend>
        {[1, 2, 3, 4, 5].map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="rating"
              value={value}
              checked={rating === String(value)}
              onChange={(event) => setRating(event.target.value)}
              required
            />
            {value} ★
          </label>
        ))}
      </fieldset>
      <label className="review-comment">
        Comment (optional)
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={1000}
          rows={4}
          disabled={isSaving}
          placeholder="What went well?"
        />
      </label>
      <small>{comment.length} / 1,000 characters · Reviews are public.</small>
      {error && (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isSaving}>
        {isSaving ? 'Saving review…' : 'Submit review'}
      </Button>
    </form>
  );
}
