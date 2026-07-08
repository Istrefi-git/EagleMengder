import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ruler } from 'lucide-react';
import { useAuthStore } from '../lib/authStore';

export default function ForgotPassword() {
  const resetPassword = useAuthStore((s) => s.resetPassword);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = resetPassword(email, password);
    if (!result.ok) {
      setError(result.error ?? 'Kunne ikke nullstille passord.');
      return;
    }
    setError(null);
    setDone(true);
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
          <h1 className="site-auth-title">Glemt passord</h1>
          <p className="site-auth-sub">
            Skriv inn e-posten din og et nytt passord. Siden dette er en demo uten
            e-postutsendelse, settes passordet direkte.
          </p>

          {done ? (
            <div className="site-success" style={{ marginTop: 20 }}>
              Passordet er oppdatert. Du kan nå logge inn med det nye passordet.
            </div>
          ) : (
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
                <span className="site-label">Nytt passord</span>
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
                Oppdater passord
              </button>
            </form>
          )}

          <p className="site-auth-footer">
            <Link to="/login">Tilbake til innlogging</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
