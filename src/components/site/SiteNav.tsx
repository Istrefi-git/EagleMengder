import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Moon, Ruler, Sun } from 'lucide-react';
import { useStore } from '../../store';
import { useCurrentUser } from '../../lib/authStore';
import { UserMenu } from './UserMenu';

export function SiteNav() {
  const user = useCurrentUser();
  // Samme lagrede tema som tegneverktøyet bruker (se TilbudEditor) – valget her
  // følger derfor med inn i editoren og omvendt.
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

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
          <button
            className="site-btn ghost sm icon-only"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Bytt til lys modus' : 'Bytt til mørk modus'}
            aria-label={theme === 'dark' ? 'Bytt til lys modus' : 'Bytt til mørk modus'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
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
