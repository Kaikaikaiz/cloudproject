import { useState } from 'react';
import { api } from '../lib/api';
import Button from './Button';
import Modal from './Modal';
import Select from './Select';

const reasons = [
  'Scam / Fraud',
  'Inappropriate Content',
  'Prohibited Item',
  'Misleading Information',
  'Duplicate Listing',
  'Other',
];

export default function ReportListing({ listingId }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/reports', { method: 'POST', body: { listingId, reason, description } });
      setSubmitted(true);
      setOpen(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {submitted ? (
        <p className="form-message success-message" role="status">
          Report submitted. The administrator will review it.
        </p>
      ) : (
        <Button variant="ghost" onClick={() => setOpen(true)}>
          Report listing
        </Button>
      )}
      <Modal
        open={open}
        title="Report this listing"
        onClose={() => {
          if (!busy) setOpen(false);
        }}
      >
        <form className="review-form" onSubmit={submit}>
          <p>
            Tell us what needs attention. Your report will be reviewed by the
            administrator.
          </p>
          <Select
            label="Reason"
            options={reasons}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            disabled={busy}
          />
          <label className="review-comment">
            Description (optional)
            <textarea
              rows={4}
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={busy}
            />
          </label>
          {error && (
            <p className="form-message error-message" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit report'}
          </Button>
        </form>
      </Modal>
    </>
  );
}
