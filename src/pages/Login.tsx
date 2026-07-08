import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Ruler } from 'lucide-react';
import { useAuthStore } from '../lib/authStore';

export default function Login() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname: string } } };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = login(email, password);
    if (!result.ok) {
      setError(result.error ?? 'Kunne ikke logge inn.');
      return;
    }
    navigate(location.state?.from?.pathname ?? '/dashboard', { replace: true });
  }

  return (
    <div className="site">
      <div className="site-auth-shell">
        <div className="site-auth-card">
          <Link to="/" className="site-logo">
            <span className="site-logo-mark">
              <Ruler size={15} />
            </span>
            Mengdemåler
          </Link>
          <h1 className="site-auth-title">Logg inn</h1>
          <p className="site-auth-sub">Fortsett til dine prosjekter og tilbud.</p>

          <form className="site-form" onSubmit={onSubmit}>
            {error && <div className="site-error">{error}</div>}
            <label className="site-field">
              <span className="site-label">E-post</span>
              <input
                className="site-input"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="navn@firma.no"
              />
            </label>
            <label className="site-field">
              <span className="site-label">Passord</span>
              <input
                className="site-input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
            <button className="site-btn primary full" type="submit">
              Logg inn
            </button>
          </form>

          <p className="site-auth-footer">
            <Link to="/forgot-password">Glemt passord?</Link>
          </p>
          <p className="site-auth-footer">
            Ny her? <Link to="/register">Registrer deg</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
