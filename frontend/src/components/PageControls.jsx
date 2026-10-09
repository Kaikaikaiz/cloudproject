import Button from './Button';
export default function PageControls({ page, disabled }) {
  if (!page.hasPrevious && !page.nextCursor) return null;
  return (
    <nav aria-label="Results pages" className="profile-actions">
      <Button
        variant="secondary"
        disabled={disabled || !page.hasPrevious}
        onClick={page.previous}
      >
        Previous
      </Button>
      <Button
        variant="secondary"
        disabled={disabled || !page.nextCursor}
        onClick={page.next}
      >
        Next
      </Button>
    </nav>
  );
}
