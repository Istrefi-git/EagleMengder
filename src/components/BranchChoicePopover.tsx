import { X } from 'lucide-react';
import { useStore } from '../store';
import type { ViewTransform } from '../store';
import { categoryOf, isRectDim } from '../types';
import type { BranchFittingType } from '../types';

/** Liten flytende velger som dukker opp når en ny kanal/rør startes/avsluttes på et
 * eksisterende ventilasjonsanlegg (må velge påstikk/T-kanal), ELLER når man
 * dobbeltklikker en eksisterende avgreiningsmarkør for å bytte type (`choice.editId`
 * satt – se BranchMarker/resolvePendingBranchChoice). Valgene avhenger av om
 * hovedrøret er en kanal (påstikk/T-kanal) eller et rør (T-rør/45°-grenrør) – rør
 * spør aldri ved OPPRETTELSE (typen avledes automatisk), men kan likevel redigeres
 * her etterpå. */
export function BranchChoicePopover({ view }: { view: ViewTransform }) {
  const choice = useStore((s) => s.pendingBranchChoice);
  const resolve = useStore((s) => s.resolvePendingBranchChoice);
  const cancel = useStore((s) => s.setPendingBranchChoice);

  if (!choice) return null;
  const screenX = choice.x * view.scale + view.x;
  const screenY = choice.y * view.scale + view.y;

  const kind = categoryOf(choice.mainSubId)?.kind;
  const isEdit = choice.editId != null;
  // Rund↔rektangulær mismatch: «T-kanal» finnes ikke fysisk her – samme fysiske
  // regel som ved automatisk innsetting (se insertBranchForTarget i PdfCanvas.tsx).
  const shapeMismatch = isRectDim(choice.mainDimension) !== isRectDim(choice.branchDimension);

  const options: { type: BranchFittingType; label: string; disabled?: boolean }[] =
    kind === 'pipe'
      ? [
          { type: 'tee', label: 'T-rør' },
          { type: 'wye45', label: '45° grenrør' },
        ]
      : [
          { type: 'saddle_tap', label: 'Påstikk' },
          {
            type: 'tee_duct',
            label: 'T-kanal',
            disabled: shapeMismatch,
          },
        ];

  return (
    <div className="branch-choice-popover" style={{ left: screenX, top: screenY }}>
      <div className="branch-choice-head">
        <span>{isEdit ? 'Endre avgreiningstype' : 'Velg avgreiningstype'}</span>
        <button className="btn icon" onClick={() => cancel(null)}>
          <X size={13} />
        </button>
      </div>
      <div className="branch-choice-actions">
        {options.map((opt) => (
          <button
            key={opt.type}
            className={`btn ${isEdit && choice.currentFittingType === opt.type ? 'active' : ''}`}
            onClick={() => resolve(opt.type)}
            disabled={opt.disabled}
            title={opt.disabled ? 'Finnes ikke mellom rund og rektangulær – bruk påstikk' : undefined}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
