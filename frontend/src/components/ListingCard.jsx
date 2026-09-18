import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import ItemArt from './ItemArt';
import StatusBadge from './StatusBadge';
export default function ListingCard({ listing }) {
 return <article className="listing-card"><Link to={`/listing/${listing.id}`} className={`listing-image tone-${listing.tone}`} aria-label={listing.title}><span className="sample-tag">Sample find</span><ItemArt kind={listing.art}/><span className="listing-arrow"><ArrowUpRight size={18}/></span></Link><div className="listing-meta"><span>{listing.category}</span><span className="price">${listing.price}</span></div><Link className="listing-title" to={`/listing/${listing.id}`}>{listing.title}</Link><StatusBadge>{listing.condition}</StatusBadge><div className="listing-seller"><span className={`avatar tone-${listing.tone}`}>{listing.initials}</span><span>@{listing.seller}</span><span className="seller-note">a lovely little find</span></div></article>;
}
