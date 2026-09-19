import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowUpRight, Menu, X, Heart, UserRound } from 'lucide-react';
const links = [
  ['/', 'Marketplace'],
  ['/sell', 'Sell'],
  ['/my-offers', 'My Offers'],
  ['/my-listings', 'My Listings'],
  ['/wallet', 'Wallet'],
  ['/favourites', 'Favourites'],
  ['/profile', 'Profile'],
];
export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="reLIVE home">
      <span className="logo-mark" aria-hidden="true">
        ↗
      </span>
      re<span>LIVE</span>
      <span className="logo-dot">.</span>
    </Link>
  );
}
export default function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="nav-wrap">
        <Logo />
        <button
          className="icon-button mobile-menu"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
        <nav
          id="main-nav"
          className={open ? 'nav-links is-open' : 'nav-links'}
          aria-label="Main navigation"
        >
          {links.map(([to, label]) => (
            <NavLink key={to} end={to === '/'} to={to} onClick={() => setOpen(false)}>
              {label === 'Favourites' && <Heart size={15} />}{' '}
              {label === 'Profile' && <UserRound size={15} />} {label}
            </NavLink>
          ))}
        </nav>
        <Link className="nav-sell" to="/sell">
          Sell an item <ArrowUpRight size={17} />
        </Link>
      </div>
    </header>
  );
}
