import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useCurrentUser } from '../../lib/authStore';

export function RequireAuth() {
  const user = useCurrentUser();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
}
