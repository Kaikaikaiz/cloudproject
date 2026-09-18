import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { listings } from '../data/listings';
import ItemArt from '../components/ItemArt';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';
export default function ListingDetails() { const { id } = useParams(); const listing = listings.find(item => item.id === id);
 if (!listing) return <EmptyState title="This find isn’t here" description="Head back to the marketplace to explore our sample collection."/>;
 return <section className="page-section"><Link className="back-link" to="/"><ArrowLeft size={16}/> Back to the marketplace</Link><div className="detail-grid"><div className={`detail-image tone-${listing.tone}`}><ItemArt kind={listing.art}/></div><div className="detail-copy"><StatusBadge tone="lavender">Sample listing</StatusBadge><p className="eyebrow muted">{listing.category}</p><h1>{listing.title}</h1><p className="detail-price">${listing.price}</p><StatusBadge>{listing.condition}</StatusBadge><p>A pre-loved little treasure, ready for a new chapter. This sample gives you a peek at how listing details will look on reLIVE.</p><div className="seller-line"><span className={`avatar tone-${listing.tone}`}>{listing.initials}</span> Listed by @{listing.seller}</div><Button disabled>Offers coming soon</Button><small>This is a preview. This item is not available to buy.</small></div></div></section>;
}
