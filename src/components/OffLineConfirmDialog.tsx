import { useState } from 'react';
import { useStore } from '../store';
import { SYMBOL_DEFS } from '../types';

/** Vises når brukeren klikker for å plassere utstyr et sted som ikke ligger på et
 * tegnet rør/kanal – ber om bekreftelse, med mulighet for å slå av advarselen. */
export function OffLineConfirmDialog() {
  const pending = useStore((s) => s.pendingOffLineSymbol);
  const confirm = useStore((s) => s.confirmPendingOffLineSymbol);
  const cancel = useStore((s) => s.cancelPendingOffLineSymbol);

  const [suppressFuture, setSuppressFuture] = useState(false);

  if (!pending) return null;
  const label = SYMBOL_DEFS[pending.type].label;

  return (
    <div className="modal-backdrop" onMouseDown={cancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Ingen kanal/rør her</h2>
        </div>
        <div className="modal-body">
          <p className="note">
            Du setter nå inn et utstyr («{label}») hvor det ikke er kanal/rør under. Er
            du sikker på dette?
          </p>
          <label className="field row">
            <input
              type="checkbox"
              checked={suppressFuture}
              onChange={(e) => setSuppressFuture(e.target.checked)}
            />
            <span>Vis ikke denne meldingen igjen</span>
          </label>
          <div className="field row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={cancel}>
              Avbryt
            </button>
            <button className="btn primary" onClick={() => confirm(suppressFuture)}>
              Sett inn
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
