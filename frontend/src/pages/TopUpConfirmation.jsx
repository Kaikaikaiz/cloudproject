import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { rm, statusLabel } from '../lib/listings';
import { checkoutReturnPath, paymentMethodLabels, withReturnPath } from '../lib/payments';
import Button from '../components/Button';
import LoadingState from '../components/LoadingState';
import StatusBadge from '../components/StatusBadge';

export default function TopUpConfirmation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = checkoutReturnPath(searchParams.get('returnTo'));
  const [topUp, setTopUp] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    setError('');

    api('/wallet/top-ups/' + id)
      .then((data) => {
        if (isActive) {
          setTopUp(data.topUp);
        }
      })
      .catch((requestError) => {
        if (isActive) {
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [id, refreshCount]);

  async function handlePayment(action) {
    setIsSubmitting(true);
    setError('');

    try {
      const data = await api('/wallet/top-ups/' + id + '/' + action, { method: 'POST' });
      setTopUp(data.topUp);

      if (data.topUp.status === 'SUCCESS') {
        navigate(withReturnPath('/wallet/top-up/' + id + '/success', returnTo), { replace: true });
      } else {
        navigate('/wallet', { replace: true });
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <LoadingState label="Preparing your mock payment…" />;
  }

  return (
    <section className="page-section payment-page">
      <div className="page-heading"><div><h1>Confirm mock payment</h1><p>One last look before adding to your wallet.</p></div></div>
      <div className="surface payment-panel">
        <StatusBadge tone="lavender">Simulation · no real payment</StatusBadge>

        {topUp && (
          <>
            <p className="payment-total">{rm(topUp.amount)}</p>
            <p>{paymentMethodLabels[topUp.method]}</p>
            <p className="payment-mock-notice">
              Confirming simulates a successful {paymentMethodLabels[topUp.method]} payment.
              No real account is contacted or charged.
            </p>
            <dl className="payment-details">
              <div><dt>Status</dt><dd>{statusLabel(topUp.status)}</dd></div>
              <div><dt>Reference</dt><dd className="payment-reference">{topUp.reference}</dd></div>
            </dl>

            {topUp.status === 'PENDING' && (
              <div className="profile-actions">
                <Button disabled={isSubmitting} onClick={() => handlePayment('confirm')}>
                  {isSubmitting ? 'Processing…' : 'Confirm mock payment'}
                </Button>
                <Button variant="ghost" disabled={isSubmitting} onClick={() => handlePayment('cancel')}>
                  Cancel payment
                </Button>
              </div>
            )}

            {topUp.status === 'SUCCESS' && (
              <Button to={withReturnPath('/wallet/top-up/' + id + '/success', returnTo)}>View successful payment</Button>
            )}

            {topUp.status === 'CANCELLED' && <p>This mock payment was cancelled. Your balance was not changed.</p>}
          </>
        )}

        {error && (
          <div className="load-error">
            <p className="form-message error-message" role="alert">{error}</p>
            <Button variant="secondary" disabled={isSubmitting} onClick={() => setRefreshCount((count) => count + 1)}>
              Refresh payment status
            </Button>
          </div>
        )}

        <Link className="auth-link payment-back-link" to="/wallet">Back to wallet</Link>
      </div>
    </section>
  );
}

