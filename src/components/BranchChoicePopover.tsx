import { X } from 'lucide-react';
import { useStore } from '../store';
import type { ViewTransform } from '../store';

/** Liten flytende velger som dukker opp når en ny kanal startes/avsluttes på et
 * eksisterende ventilasjonsanlegg – brukeren må velge om avgreiningen skal være
 * påstikk eller T-kanal (for rør avledes typen automatisk uten å spørre). */
export function BranchChoicePopover({ view }: { view: ViewTransform }) {
  const choice = useStore((s) => s.pendingBranchChoice);
  const resolve = useStore((s) => s.resolvePendingBranchChoice);
  const cancel = useStore((s) => s.setPendingBranchChoice);

  if (!choice) return null;
  const screenX = choice.x * view.scale + view.x;
  const screenY = choice.y * view.scale + view.y;

  return (
    <div className="branch-choice-popover" style={{ left: screenX, top: screenY }}>
      <div className="branch-choice-head">
        <span>Velg avgreiningstype</span>
        <button className="btn icon" onClick={() => cancel(null)}>
          <X size={13} />
        </button>
      </div>
      <div className="branch-choice-actions">
        <button className="btn" onClick={() => resolve('saddle_tap')}>
          Påstikk
        </button>
        <button className="btn" onClick={() => resolve('tee_duct')}>
          T-kanal
        </button>
      </div>
    </div>
  );
}
