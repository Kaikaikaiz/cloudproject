export default function ModerationNotice({ listing }) {
  if (!['NEEDS_REVISION', 'UNDER_REVIEW', 'REMOVED'].includes(listing.status))
    return null;

  const titles = {
    NEEDS_REVISION: 'Your listing requires revision',
    UNDER_REVIEW: 'Your listing is under review',
    REMOVED: 'Your listing has been removed from the marketplace',
  };

  return (
    <div className="moderation-notice" role="status">
      <strong>{titles[listing.status]}</strong>
      {listing.moderationReason && <p>{listing.moderationReason}</p>}
      <small>
        {listing.status === 'NEEDS_REVISION'
          ? 'Edit your listing and resubmit it for review.'
          : 'This listing is hidden from the public marketplace.'}
      </small>
    </div>
  );
}
