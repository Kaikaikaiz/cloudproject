import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingState from './LoadingState';
import Button from './Button';
import EmptyState from './EmptyState';
export default function ProtectedRoute({ admin = false }) {
  const { user, loading, error, refresh } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingState label="Opening your little corner of reLIVE…" />;
  if (error)
    return (
      <div className="empty-state">
        <p role="alert">{error}</p>
        <Button onClick={refresh}>Try again</Button>
      </div>
    );
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (admin && user.role !== 'ADMIN')
    return (
      <EmptyState
        title="This space is for administrators"
        description="Your account does not have access to this page."
      />
    );
  return <Outlet />;
}
