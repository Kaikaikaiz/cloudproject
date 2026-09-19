import { Link } from 'react-router-dom';
import { rm, statusLabel } from '../lib/listings';
import { paymentMethodLabels } from '../lib/payments';
import StatusBadge from './StatusBadge';
import EmptyState from './EmptyState';

export default function WalletHistory({ transactions }) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        title="Your next chapter starts here"
        description="Top-ups, purchases and seller earnings will appear here."
        action={false}
      />
    );
  }

  return (
    <div className="wallet-history">
      {transactions.map((transaction) => {
        const isDebit = transaction.type === 'PURCHASE';
        const isSuccessful = transaction.status === 'SUCCESS';
        const title = transaction.type === 'TOP_UP' ? 'Wallet top-up' : statusLabel(transaction.type);
        let receiptPath = transaction.purchaseId
          ? '/purchases/' + transaction.purchaseId
          : '/wallet/top-up/' + transaction.id;

        if (transaction.type === 'TOP_UP' && isSuccessful) {
          receiptPath += '/success';
        }

        return (
          <article key={transaction.id} className="wallet-history-row">
            <div className="wallet-history-description">
              <strong>{title}</strong>
              <span>
                {paymentMethodLabels[transaction.method]} ·{' '}
                {new Date(transaction.createdAt).toLocaleString('en-MY', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
              <small className="payment-reference">{transaction.reference}</small>
              <Link className="auth-link" to={receiptPath}>
                {transaction.status === 'PENDING' ? 'Continue mock payment' : 'View details'}
              </Link>
            </div>

            <div className="wallet-history-amount">
              <strong className={isSuccessful && !isDebit ? 'wallet-credit' : ''}>
                {isSuccessful ? (isDebit ? '− ' : '+ ') : ''}
                {rm(transaction.amount)}
              </strong>
              <StatusBadge tone={isSuccessful ? 'mint' : 'lavender'}>
                {statusLabel(transaction.status)}
              </StatusBadge>
            </div>
          </article>
        );
      })}
    </div>
  );
}

