import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ruler } from 'lucide-react';
import { useAuthStore } from '../lib/authStore';

export default function Register() {
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = register(name, email, password);
    if (!result.ok) {
      setError(result.error ?? 'Kunne ikke registrere bruker.');
      return;
    }
    navigate('/dashboard', { replace: true });
  }

  return (
    <div className="site">
      <div className="site-auth-shell">
        <div className="site-auth-card">
          <Link to="/" className="site-logo">
            <span className="site-logo-mark">
              <Ruler size={15} />
            </span>
            IstrefiCAD
          </Link>
          <h1 className="site-auth-title">Opprett konto</h1>
          <p className="site-auth-sub">Gratis å starte – ingen kredittkort nødvendig.</p>

          <form className="site-form" onSubmit={onSubmit}>
            {error && <div className="site-error">{error}</div>}
            <label className="site-field">
              <span className="site-label">Navn</span>
              <input
                className="site-input"
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Kari Nordmann"
              />
            </label>
            <label className="site-field">
              <span className="site-label">E-post</span>
              <input
                className="site-input"
                type="email"
                required
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
                placeholder="Minst 6 tegn"
              />
            </label>
            <button className="site-btn primary full" type="submit">
              Opprett konto
            </button>
          </form>

          <p className="site-auth-footer">
            Har du allerede konto? <Link to="/login">Logg inn</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
