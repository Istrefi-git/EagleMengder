import { GitBranch, Move, Wrench, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import type { ViewTransform, CanvasMenuTarget } from '../store';
import { categoryOf } from '../types';

export type CanvasMenuCommand = 'branch' | 'clamp' | 'move' | 'delete' | 'continue';

/** Høyreklikk-meny for et rør/kanal, modellert på BranchChoicePopover (samme
 * verden→skjerm-posisjonering, samme flytende-panel-stil) – men med en
 * `onCommand`-callback i stedet for en selvstendig store-action, siden kommandoene
 * (ny avgrening, flytt, fortsett) trenger tegnesesjonens tilstand som bor i
 * PdfCanvas' egne closures (draftPoints, preserveDraftRef, insertBranchForTarget). */
export function CanvasContextMenu({
  view,
  onCommand,
}: {
  view: ViewTransform;
  onCommand: (target: CanvasMenuTarget, command: CanvasMenuCommand) => void;
}) {
  const menu = useStore((s) => s.canvasMenu);
  const close = useStore((s) => s.setCanvasMenu);
  // Subkategorien ligger ikke direkte på target – target bærer kun lineId, så
  // arten (rør/kanal) hentes fra selve linjen for å velge riktig ord i etikettene.
  // MÅ kalles ubetinget (Rules of Hooks) – derfor FØR den tidlige returen under,
  // selv om resultatet kun brukes når menu finnes.
  const line = useStore((s) => (menu ? s.lines.find((l) => l.id === menu.target.lineId) : undefined));

  if (!menu) return null;
  const screenX = menu.x * view.scale + view.x;
  const screenY = menu.y * view.scale + view.y;

  const run = (command: CanvasMenuCommand) => {
    close(null);
    onCommand(menu.target, command);
  };

  const kind = line ? categoryOf(line.subId)?.kind : undefined;
  const noun = kind === 'duct' ? 'kanalen' : 'røret';
  const deleteLabel = kind === 'duct' ? 'Slett kanal' : 'Slett rør';

  return (
    <div className="canvas-menu" style={{ left: screenX, top: screenY }}>
      {menu.target.type === 'openEnd' ? (
        <button className="canvas-menu-item" onClick={() => run('continue')}>
          <GitBranch size={14} />
          Fortsett på {noun}
        </button>
      ) : (
        <>
          <button className="canvas-menu-item" onClick={() => run('branch')}>
            <GitBranch size={14} />
            Ny avgrening
          </button>
          <button className="canvas-menu-item" onClick={() => run('clamp')}>
            <Wrench size={14} />
            Sett inn klammer
          </button>
          <button className="canvas-menu-item" onClick={() => run('move')}>
            <Move size={14} />
            Flytt rør eller kanal
          </button>
          <button className="canvas-menu-item danger" onClick={() => run('delete')}>
            <Trash2 size={14} />
            {deleteLabel}
          </button>
        </>
      )}
    </div>
  );
}
