import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { rm } from '../lib/listings';
import { checkoutReturnPath, paymentMethodLabels } from '../lib/payments';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import LoadingState from '../components/LoadingState';

export default function PaymentSuccess({ kind }) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const returnTo = checkoutReturnPath(searchParams.get('returnTo'));
  const { user, setUser } = useAuth();
  const [payment, setPayment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);
  const isTopUp = kind === 'top-up';

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    setError('');

    const endpoint = isTopUp ? '/wallet/top-ups/' + id : '/purchases/' + id;

    api(endpoint)
      .then((data) => {
        const receipt = isTopUp ? data.topUp : data.purchase;

        if (receipt.status !== 'SUCCESS') {
          throw new Error(
            'This payment has not completed. Check its status in your wallet.',
          );
        }

        if (isActive) {
          setPayment(receipt);
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

    if (!isTopUp) {
      api('/auth/me')
        .then((data) => {
          if (isActive) {
            setUser(data.user);
          }
        })
        .catch(() => {});
    }

    return () => {
      isActive = false;
    };
  }, [id, isTopUp, refreshCount, setUser]);

  if (isLoading) {
    return <LoadingState label="Opening your payment receipt…" />;
  }

  if (error) {
    return (
      <section className="page-section payment-page">
        <div className="surface payment-panel">
          <p className="form-message error-message" role="alert">
            {error}
          </p>
          <div className="profile-actions">
            <Button onClick={() => setRefreshCount((count) => count + 1)}>
              Try again
            </Button>
            <Button to="/wallet" variant="secondary">
              Back to wallet
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const isSeller = !isTopUp && user.id === payment.sellerId;
  const title = isTopUp
    ? 'Top-up successful!'
    : isSeller
      ? 'Payment received!'
      : 'It’s yours!';

  return (
    <section className="page-section payment-page">
      <div className="surface payment-panel payment-success">
        <CheckCircle2 className="payment-success-icon" size={54} strokeWidth={1.4} />
        <h1>{title}</h1>
        <p>
          {isTopUp ? 'A little more room for your next favourite.' : payment.listingTitle}
        </p>
        <strong className="payment-total">{rm(payment.amount)}</strong>
        <p className="payment-mock-notice">
          Simulated payment complete · No real money was moved.
        </p>

        <dl className="payment-details">
          <div>
            <dt>Method</dt>
            <dd>{paymentMethodLabels[payment.method]}</dd>
          </div>
          {!isTopUp && (
            <div>
              <dt>{isSeller ? 'Buyer' : 'Seller'}</dt>
              <dd>{isSeller ? payment.buyer.name : payment.seller.name}</dd>
            </div>
          )}
          <div>
            <dt>Date</dt>
            <dd>{new Date(payment.createdAt).toLocaleString('en-MY')}</dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd className="payment-reference">{payment.reference}</dd>
          </div>
        </dl>

        <div className="profile-actions">
          {!isTopUp && payment.transaction && (
            <Button to={'/transactions/' + payment.transaction.id} variant="secondary">
              View transaction & review
            </Button>
          )}
          {isTopUp && returnTo && <Button to={returnTo}>Return to checkout</Button>}
          <Button to="/wallet" variant={returnTo ? 'secondary' : 'primary'}>
            View wallet
          </Button>
          <Button to="/" variant="ghost">
            Explore more finds
          </Button>
        </div>
      </div>
    </section>
  );
}
