import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { rm } from '../lib/listings';
import Button from './Button';
import Input from './Input';
import Modal from './Modal';

export default function MakeOfferModal({ listing, open, onClose }) {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setAmount('');
      setError('');
    }
  }, [open]);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const { offer } = await api('/offers', {
        method: 'POST',
        body: { listingId: listing.id, amount },
      });

      navigate('/offers/' + offer.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    if (!isSubmitting) {
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Make a little offer">
      <p className="modal-copy">
        {listing.title} · Asking price {rm(listing.price)}
      </p>

      <form className="offer-form" onSubmit={handleSubmit}>
        <Input
          label="Your offer (RM)"
          type="number"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          min="0.01"
          max="999999.99"
          step="0.01"
          required
          disabled={isSubmitting}
          hint="The seller can accept, reject or suggest another price."
        />

        {error && (
          <div className="form-message error-message" role="alert">
            <p>{error}</p>
            <Link to="/my-offers/made" className="auth-link">
              View Offers Made
            </Link>
          </div>
        )}

        <div className="profile-actions">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Sending offer…' : 'Send offer'}
          </Button>
          <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
