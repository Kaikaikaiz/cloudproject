import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Bell, Menu, X, Heart, UserRound, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { imageUrl } from '../lib/api';
import { rm } from '../lib/listings';
const links = [
  ['/', 'Marketplace'],
  ['/dashboard', 'Dashboard'],
  ['/sell', 'Sell'],
  ['/my-offers', 'My Offers'],
  ['/my-listings', 'My Listings'],
  ['/favourites', 'Favourites'],
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
  const { user, unread, walletBalance } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const visibleLinks = isAdmin
    ? [
        ['/', 'Marketplace'],
        ['/admin', 'Reports'],
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
              {label === 'Dashboard' && <span className="nav-notification"><Bell size={15} />{unread > 0 && <i className="notification-dot" role="status" aria-label="Unread notifications" />}</span>}{' '}
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="nav-account">
          {user ? <>
            {!isAdmin && <NavLink to="/wallet" className="nav-wallet" title="View wallet & transactions" onClick={() => setOpen(false)}>
              <Wallet size={17} aria-hidden="true" />
              <span>{walletBalance === null ? 'RM —' : rm(walletBalance)}</span>
            </NavLink>}
            <NavLink to="/profile" className="nav-profile" title="Manage Profile" onClick={() => setOpen(false)}>
              {user.profileImage ? <img className="nav-avatar" src={imageUrl(user.profileImage)} alt="" /> : <UserRound size={17} aria-hidden="true" />}
              <span>{user.name}</span>
            </NavLink>
          </> : <NavLink to="/login" onClick={() => setOpen(false)}>Log in</NavLink>}
        </div>
      </div>
    </header>
  );
}
