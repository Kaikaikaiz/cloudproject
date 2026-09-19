import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LockKeyhole } from 'lucide-react';
import Button from './Button';
import Modal from './Modal';

export function LoginRequiredContent({ destination, onBack }) {
  return (
    <div className="login-required-copy">
      <span className="login-required-icon" aria-hidden="true"><LockKeyhole size={25} /></span>
      <h1>Login Required</h1>
      <p>You need to log in to access this feature. Please log in to continue and enjoy all available features.</p>
      <div className="profile-actions">
        <Button to="/login" state={{ from: destination }}>Log In</Button>
        {onBack && <Button variant="ghost" onClick={onBack}>Go Back</Button>}
      </div>
    </div>
  );
}

export function LoginRequiredModal({ open, onClose, destination }) {
  return <Modal open={open} onClose={onClose} title="Login Required"><LoginRequiredContent destination={destination} onBack={onClose} /></Modal>;
}

export default function LoginRequired() {
  const location = useLocation();
  const navigate = useNavigate();
  const destination = location.pathname + location.search + location.hash;
  return <section className="page-section login-required-page"><div className="surface login-required-card"><LoginRequiredContent destination={destination} onBack={() => navigate(-1)} /></div></section>;
}
