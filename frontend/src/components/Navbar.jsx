import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowUpRight, Menu, X, Heart, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
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
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const visibleLinks = isAdmin
    ? [
        ['/', 'Marketplace'],
        ['/admin', 'Reports'],
        ['/profile', 'Profile'],
      ]
    : links;
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
          {visibleLinks.map(([to, label]) => (
            <NavLink key={to} end={to === '/'} to={to} onClick={() => setOpen(false)}>
              {label === 'Favourites' && <Heart size={15} />}{' '}
              {label === 'Profile' && <UserRound size={15} />} {label}
            </NavLink>
          ))}
        </nav>
        {!isAdmin && (
          <Link className="nav-sell" to="/sell">
            Sell an item <ArrowUpRight size={17} />
          </Link>
        )}
      </div>
    </header>
  );
}
