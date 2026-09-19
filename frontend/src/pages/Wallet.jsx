import { useEffect, useState } from 'react';
import { Wallet as WalletIcon, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { rm } from '../lib/listings';
import Button from '../components/Button';
import LoadingState from '../components/LoadingState';
import WalletHistory from '../components/WalletHistory';

export default function Wallet() {
  const [wallet, setWallet] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    setError('');

    api('/wallet')
      .then((data) => {
        if (isActive) {
          setWallet(data);
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
  }, [refreshCount]);

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">YOUR RELIVE</span>
          <h1>Wallet</h1>
          <p>A little balance for your next favourite find.</p>
        </div>
        <Button
          variant="secondary"
          disabled={isLoading}
          onClick={() => setRefreshCount((count) => count + 1)}
        >
          Refresh
        </Button>
      </div>

      <p className="payment-mock-notice">
        Demo wallet · All payments are simulated. No real money is moved.
      </p>

      {isLoading ? (
        <LoadingState label="Opening your wallet…" />
      ) : error ? (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      ) : (
        <>
          <div className="wallet-summary">
            <div className="wallet-balance-card">
              <WalletIcon size={25} />
              <span>Current balance</span>
              <strong>{rm(wallet.balance)}</strong>
              <Button to="/wallet/top-up">Top Up</Button>
            </div>

            <div className="wallet-earnings-card surface">
              <TrendingUp size={25} />
              <span>Seller earnings</span>
              <strong>{rm(wallet.sellerEarnings)}</strong>
              <p>
                Total earnings from completed sales. Earnings are added to your wallet.
              </p>
            </div>
          </div>

          <section className="surface wallet-history-section">
            <h2>Transaction history</h2>
            <WalletHistory transactions={wallet.transactions} />
          </section>
        </>
      )}
    </section>
  );
}
