import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}

/** Liten forankret dropdown-knapp – samler flere relaterte kontroller (toggles,
 * knapper) bak én knapp i stedet for at de tar opp plass hver for seg i en rad. */
export function IconMenu({ icon: Icon, label, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="icon-menu" ref={ref}>
      <button
        className={`btn icon ${open ? 'active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title={label}
      >
        <Icon size={14} />
      </button>
      {open && <div className="icon-menu-panel">{children}</div>}
    </div>
  );
}
