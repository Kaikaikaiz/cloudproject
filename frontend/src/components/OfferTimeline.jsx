import { getHistoryMessage } from '../lib/offers';

export default function OfferTimeline({ offer }) {
  return (
    <section className="offer-timeline-section" aria-labelledby="timeline-heading">
      <h2 id="timeline-heading">The negotiation so far</h2>

      <ol className="offer-timeline">
        {offer.history.map((entry) => (
          <li key={entry.id}>
            <span className="timeline-marker" aria-hidden="true" />
            <div>
              <p>{getHistoryMessage(entry, offer)}</p>
              <time dateTime={entry.createdAt}>
                {new Date(entry.createdAt).toLocaleString('en-MY', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </time>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
