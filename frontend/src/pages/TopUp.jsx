import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { checkoutReturnPath, paymentMethodLabels, withReturnPath } from '../lib/payments';
import Button from '../components/Button';
import Input from '../components/Input';
import StatusBadge from '../components/StatusBadge';

export default function TopUp() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = checkoutReturnPath(searchParams.get('returnTo'));
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('FPX');
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  function handleAmountChange(event) {
    setAmount(event.target.value);
    setRequestKey(crypto.randomUUID());
  }

  function handleMethodChange(event) {
    setMethod(event.target.value);
    setRequestKey(crypto.randomUUID());
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const { topUp } = await api('/wallet/top-ups', {
        method: 'POST',
        body: { amount, method, requestKey },
      });

      navigate(withReturnPath('/wallet/top-up/' + topUp.id, returnTo));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="page-section payment-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">A LITTLE SOMETHING FOR YOUR WALLET</span>
          <h1>Top up</h1>
          <p>Choose an amount and a mock Malaysian payment method.</p>
        </div>
      </div>

      <form className="surface payment-panel" onSubmit={handleSubmit}>
        <StatusBadge tone="lavender">Mock payment only</StatusBadge>
        <p className="payment-mock-notice">
          This is a local simulation. No bank account, eWallet login or real payment is needed.
        </p>

        <Input
          label="Top-up amount (RM)"
          type="number"
          min="0.01"
          max="999999.99"
          step="0.01"
          value={amount}
          onChange={handleAmountChange}
          required
          disabled={isSubmitting}
        />

        <fieldset className="payment-methods" disabled={isSubmitting}>
          <legend>Choose a mock payment method</legend>
          {['FPX', 'TNG'].map((paymentMethod) => (
            <label key={paymentMethod} className={method === paymentMethod ? 'payment-method selected' : 'payment-method'}>
              <input
                type="radio"
                name="method"
                value={paymentMethod}
                checked={method === paymentMethod}
                onChange={handleMethodChange}
              />
              <span>{paymentMethodLabels[paymentMethod]}<small>Simulated payment</small></span>
            </label>
          ))}
        </fieldset>

        {error && <p className="form-message error-message" role="alert">{error}</p>}

        <div className="profile-actions">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Preparing…' : 'Review mock payment'}
          </Button>
          <Button to={returnTo || '/wallet'} variant="ghost">Back</Button>
        </div>
      </form>
    </section>
  );
}

