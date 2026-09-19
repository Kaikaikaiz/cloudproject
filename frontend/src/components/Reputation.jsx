export default function Reputation({ user }) {
  const average = user.averageRating || 0;
  const filledStars = Math.round(average);

  return (
    <div className="reputation" aria-label="User reputation">
      <strong>
        <span
          className="rating-stars"
          aria-label={average.toFixed(1) + ' out of 5 stars'}
        >
          {'★'.repeat(filledStars)}
          {'☆'.repeat(5 - filledStars)}
        </span>{' '}
        {average ? average.toFixed(1) : 'No ratings yet'}
      </strong>
      <span>{user.totalReviews || 0} Reviews</span>
      <span>{user.completedTransactions || 0} Completed Transactions</span>
    </div>
  );
}
