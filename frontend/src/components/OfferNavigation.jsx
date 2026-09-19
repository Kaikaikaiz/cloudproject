import { NavLink } from 'react-router-dom';

export default function OfferNavigation() {
  return (
    <nav className="offer-navigation" aria-label="Offer pages">
      <NavLink to="/my-offers/made">Offers Made</NavLink>
      <NavLink to="/my-offers/received">Offers Received</NavLink>
    </nav>
  );
}
