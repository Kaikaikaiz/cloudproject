import { useState } from 'react';
import { api } from '../lib/api';
import { rm } from '../lib/listings';
import Button from './Button';
import Input from './Input';
import Modal from './Modal';

export default function OfferActions({ offer, onUpdate }) {
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const actions = offer.allowedActions;

  async function sendAction(action) {
    setIsSubmitting(true);
    setError('');

    try {
      const data = await api('/offers/' + offer.id + '/actions', {
        method: 'POST',
        body: {
          action,
          version: offer.version,
          ...(action === 'counter' ? { amount } : {}),
        },
      });

      setConfirmation('');
      setAmount('');
      onUpdate(data.offer);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCounter(event) {
    event.preventDefault();
    sendAction('counter');
  }

  const confirmationLabels = {
    accept: 'Accept ' + rm(offer.currentAmount) + '?',
    reject: 'Reject this offer?',
    cancel: 'Cancel your offer?',
  };

  const confirmationMessages = {
    accept:
      'This will reserve the listing at the agreed amount and close all other open offers. No payment will be taken.',
    reject: 'This ends the negotiation. The current amount will not be accepted.',
    cancel:
      'This ends your negotiation with the seller. You cannot continue this offer afterwards.',
  };

  return (
    <section className="offer-actions-panel">
      {actions.includes('counter') && (
        <form className="counter-form" onSubmit={handleCounter}>
          <Input
            label="Suggest another price (RM)"
            type="number"
            min="0.01"
            max="999999.99"
            step="0.01"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={isSubmitting}
          />
          <Button type="submit" variant="secondary" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send counteroffer'}
          </Button>
        </form>
      )}

      <div className="profile-actions">
        {actions.includes('accept') && (
          <Button onClick={() => setConfirmation('accept')} disabled={isSubmitting}>
            Accept {rm(offer.currentAmount)}
          </Button>
        )}
        {actions.includes('reject') && (
          <Button
            variant="secondary"
            onClick={() => setConfirmation('reject')}
            disabled={isSubmitting}
          >
            Reject
          </Button>
        )}
        {actions.includes('cancel') && (
          <Button
            variant="ghost"
            onClick={() => setConfirmation('cancel')}
            disabled={isSubmitting}
          >
            Cancel my offer
          </Button>
        )}
      </div>

      {error && !confirmation && (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      )}

      <Modal
        open={Boolean(confirmation)}
        onClose={() => {
          if (!isSubmitting) {
            setConfirmation('');
          }
        }}
        title={confirmationLabels[confirmation] || 'Confirm action'}
      >
        <p className="modal-copy">{confirmationMessages[confirmation]}</p>

        {error && (
          <p className="form-message error-message" role="alert">
            {error}
          </p>
        )}

        <div className="profile-actions">
          <Button disabled={isSubmitting} onClick={() => sendAction(confirmation)}>
            {isSubmitting ? 'Saving…' : 'Confirm'}
          </Button>
          <Button
            variant="ghost"
            disabled={isSubmitting}
            onClick={() => setConfirmation('')}
          >
            Keep negotiating
          </Button>
        </div>
      </Modal>
    </section>
  );
}
