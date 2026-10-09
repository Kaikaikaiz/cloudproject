import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Logo } from './Navbar';
export default function Footer() {
  const { user } = useAuth();
  return (
    <footer className="site-footer">
      <div>
        <Logo />
        <p>Good things deserve another chapter.</p>
      </div>
      <div className="footer-links">
        <Link to="/">Marketplace</Link>
        <Link to="/sell">Start selling</Link>
        {!user && <Link to="/login">Log in</Link>}
      </div>
      <span className="footer-note">
        Made for a little less waste <Heart size={14} />
      </span>
    </footer>
  );
}
