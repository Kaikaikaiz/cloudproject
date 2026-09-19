export default function LoadingState({ label = 'Finding something lovely…' }) {
  return (
    <div className="empty-state" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
