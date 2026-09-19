import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import Button from '../components/Button';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import { statusLabel } from '../lib/listings';

export default function AdminReports() {
  const [params, setParams] = useSearchParams();
  const group = params.get('group') || 'pending';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api('/admin/reports?group=' + encodeURIComponent(group))
      .then((result) => {
        if (active) setData(result);
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
  }, [group, refresh]);

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">RELIVE MODERATION</span>
          <h1>Reports dashboard</h1>
          <p>Review concerns and help sellers keep listings clear and appropriate.</p>
        </div>
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}
        >
          Refresh
        </Button>
      </div>
      <div className="moderation-tabs" role="group" aria-label="Report groups">
        {[
          ['pending', 'Pending Reports'],
          ['reviewing', 'Under Review'],
          ['resolved', 'Resolved Reports'],
        ].map(([value, label]) => (
          <Button
            key={value}
            variant={group === value ? 'primary' : 'secondary'}
            aria-pressed={group === value}
            onClick={() => setParams({ group: value })}
          >
            {label}
            {data ? ' (' + data.counts[value] + ')' : ''}
          </Button>
        ))}
      </div>
      {loading ? (
        <LoadingState label="Loading reports…" />
      ) : error ? (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      ) : data.reports.length === 0 ? (
        <EmptyState
          title="All clear here"
          description="There are no reports in this group."
          action={false}
        />
      ) : (
        <div className="transaction-list">
          {data.reports.map((report) => (
            <article className="surface transaction-card" key={report.id}>
              <div className="transaction-card-heading">
                <h2>{report.listing.title}</h2>
                <StatusBadge tone="lavender">{statusLabel(report.status)}</StatusBadge>
              </div>
              <p>{report.reason}</p>
              <p className="transaction-date">
                Reported {new Date(report.createdAt).toLocaleString('en-MY')}
              </p>
              <p>Listing: {statusLabel(report.listing.status)}</p>
              <Button to={'/admin/reports/' + report.id} variant="secondary">
                Open report
              </Button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
