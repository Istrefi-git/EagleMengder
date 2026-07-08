import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useAuthStore, useCurrentUser } from '../../lib/authStore';

export function UserMenu() {
  const user = useCurrentUser();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="site-user-menu" ref={ref}>
      <button className="site-user-btn" onClick={() => setOpen((o) => !o)}>
        <span className="site-avatar">{initials || <UserIcon size={13} />}</span>
        {user.name.split(' ')[0]}
      </button>
      {open && (
        <div className="site-user-dropdown">
          <div className="site-user-dropdown-info">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <button
            className="site-dropdown-item danger"
            onClick={() => {
              logout();
              setOpen(false);
              navigate('/');
            }}
          >
            <LogOut size={15} />
            Logg ut
          </button>
        </div>
      )}
    </div>
  );
}
