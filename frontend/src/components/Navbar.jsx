import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowUpRight, Bell, Menu, X, Heart, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
const links = [
  ['/', 'Marketplace'],
  ['/dashboard', 'Dashboard'],
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
  const [unread, setUnread] = useState(0);
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  useEffect(() => {
    if (!user || isAdmin) { setUnread(0); return; }
    let active = true;
    api('/dashboard').then((data) => active && setUnread(data.unreadNotifications)).catch(() => {});
    return () => { active = false; };
  }, [user?.id, isAdmin]);
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
              {label === 'Dashboard' && <span className="nav-notification"><Bell size={15} />{unread > 0 && <i aria-label={unread + ' unread notifications'}>{unread > 9 ? '9+' : unread}</i>}</span>}{' '}
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
