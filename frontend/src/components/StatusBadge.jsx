export default function StatusBadge({ children, tone = 'mint' }) {
  return <span className={`status-badge tone-${tone}`}>{children}</span>;
}
