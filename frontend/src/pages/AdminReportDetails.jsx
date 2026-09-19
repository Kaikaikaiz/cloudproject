import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { rm, statusLabel } from '../lib/listings';
import Button from '../components/Button';
import LoadingState from '../components/LoadingState';
import ListingGallery from '../components/ListingGallery';
import SellerSummary from '../components/SellerSummary';
import StatusBadge from '../components/StatusBadge';

export default function AdminReportDetails() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api('/admin/reports/' + id)
      .then((data) => {
        if (active) {
          setReport(data.report);
          setReason('');
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, refresh]);

  async function act(action) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = await api('/admin/reports/' + id + '/actions', {
        method: 'POST',
        body: {
          action,
          adminReason: reason,
          version: report.version,
          listingUpdatedAt: report.listing.updatedAt,
        },
      });
      setReport(data.report);
      setReason('');
      setNotice('Moderation decision saved.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Opening report…" />;
  const listing = report?.listing;
  const isOpen = report && ['PENDING', 'REVIEWING'].includes(report.status);

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <Link className="auth-link" to="/admin">
            Back to reports
          </Link>
          <h1>Report investigation</h1>
        </div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => setRefresh((value) => value + 1)}
        >
          Refresh
        </Button>
      </div>
      {error && (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="form-message success-message" role="status">
          {notice}
        </p>
      )}
      {report && (
        <>
          <div className="surface moderation-report">
            <StatusBadge tone="lavender">{statusLabel(report.status)}</StatusBadge>
            <h2>{report.reason}</h2>
            <p>
              Reported by {report.reporter.name} ·{' '}
              {new Date(report.createdAt).toLocaleString('en-MY')}
            </p>
            <p className="review-text">
              {report.description || 'No additional description.'}
            </p>
            {report.adminReason && (
              <p className="review-text">
                <strong>Last admin reason: </strong>
                {report.adminReason}
              </p>
            )}
            {report.reviewedAt && (
              <small>
                Resolved {new Date(report.reviewedAt).toLocaleString('en-MY')}
              </small>
            )}
          </div>
          <div className="detail-grid live-detail-grid">
            <ListingGallery key={listing.id} listing={listing} />
            <div className="detail-copy">
              <StatusBadge>{statusLabel(listing.status)}</StatusBadge>
              <h2>{listing.title}</h2>
              <p className="detail-price">{rm(listing.price)}</p>
              <p>
                {listing.category} · {listing.condition}
              </p>
              <p>
                {listing.city}, {listing.state}
              </p>
              <p className="listing-description">{listing.description}</p>
              <SellerSummary seller={listing.seller} />
            </div>
          </div>
          <section className="surface moderation-report">
            <h2>Moderation actions</h2>
            <p>
              Starting an investigation hides an active listing. Decisions apply to all
              open reports for this listing. Data, images and reputation are preserved.
            </p>
            {(isOpen || listing.status === 'REMOVED') && (
              <label className="review-comment">
                Admin reason (required for decisions)
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={busy}
                />
              </label>
            )}
            <div className="profile-actions">
              {report.status === 'PENDING' && (
                <Button disabled={busy} onClick={() => act('investigate')}>
                  Start investigation
                </Button>
              )}
              {isOpen && (
                <>
                  <Button
                    variant="secondary"
                    disabled={busy || !reason.trim()}
                    onClick={() => act('dismiss')}
                  >
                    Dismiss report
                  </Button>
                  {['ACTIVE', 'UNDER_REVIEW', 'NEEDS_REVISION'].includes(
                    listing.status,
                  ) && (
                    <Button
                      variant="secondary"
                      disabled={busy || !reason.trim()}
                      onClick={() => act('revision')}
                    >
                      Request Revision
                    </Button>
                  )}
                  {listing.status === 'UNDER_REVIEW' && (
                    <Button
                      disabled={busy || !reason.trim()}
                      onClick={() => act('approve')}
                    >
                      Approve listing
                    </Button>
                  )}
                  {listing.status !== 'REMOVED' && (
                    <Button
                      variant="secondary"
                      disabled={busy || !reason.trim()}
                      onClick={() => act('remove')}
                    >
                      Remove listing
                    </Button>
                  )}
                </>
              )}
              {listing.status === 'REMOVED' && (
                <Button disabled={busy || !reason.trim()} onClick={() => act('restore')}>
                  Restore listing
                </Button>
              )}
            </div>
            {busy && <p role="status">Saving moderation decision…</p>}
          </section>
        </>
      )}
    </section>
  );
}
