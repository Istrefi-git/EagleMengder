import { Link } from 'react-router-dom';
import { Ruler } from 'lucide-react';
import { useCurrentUser } from '../../lib/authStore';
import { UserMenu } from './UserMenu';

export function SiteNav() {
  const user = useCurrentUser();

  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <Link to="/" className="site-logo">
          <span className="site-logo-mark">
            <Ruler size={15} />
          </span>
          IstrefiCAD
        </Link>

        {!user && (
          <nav className="site-nav-links">
            <a href="#funksjoner">Funksjoner</a>
            <a href="#priser">Priser</a>
          </nav>
        )}

        <div className="site-nav-spacer" />

        <div className="site-nav-actions">
          {user ? (
            <>
              <Link to="/dashboard" className="site-btn ghost sm">
                Dashboard
              </Link>
              <UserMenu />
            </>
          ) : (
            <>
              <Link to="/login" className="site-btn ghost sm">
                Logg inn
              </Link>
              <Link to="/register" className="site-btn primary sm">
                Prøv gratis
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
