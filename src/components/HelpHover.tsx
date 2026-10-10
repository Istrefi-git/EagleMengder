import { useEffect, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { TOOL_HELP } from '../lib/helpContent';

/** Hvor lenge pekeren må hvile på et verktøy før forklaringen vises. */
const HOVER_DELAY_MS = 5000;

/** Viser en forklarings-boble når pekeren har hvilt i 5 sekunder på en knapp merket
 * med `data-help="<nøkkel>"` (nøkkel inn i TOOL_HELP). Én lytter på dokumentet dekker
 * alle verktøyknappene, så knappene selv trenger bare attributtet. Boblen forsvinner
 * når pekeren forlater knappen, eller ved klikk/tastetrykk. */
export function HelpHover() {
  const [shown, setShown] = useState<{ key: string; rect: DOMRect } | null>(null);
  const timer = useRef<number | null>(null);
  const current = useRef<Element | null>(null);

  useEffect(() => {
    const clear = () => {
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = null;
      current.current = null;
      setShown(null);
    };
    const onOver = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-help]') ?? null;
      if (el === current.current) return;
      clear();
      if (!el) return;
      const key = el.getAttribute('data-help') ?? '';
      if (!TOOL_HELP[key]) return;
      current.current = el;
      timer.current = window.setTimeout(() => {
        if (document.body.contains(el)) setShown({ key, rect: el.getBoundingClientRect() });
      }, HOVER_DELAY_MS);
    };
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mousedown', clear);
    document.addEventListener('keydown', clear);
    document.addEventListener('scroll', clear, true);
    return () => {
      clear();
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mousedown', clear);
      document.removeEventListener('keydown', clear);
      document.removeEventListener('scroll', clear, true);
    };
  }, []);

  if (!shown) return null;
  const help = TOOL_HELP[shown.key];
  const WIDTH = 300;
  const { rect } = shown;
  // Knapper i venstremenyen får boblen til høyre for seg; knapper i stripene øverst
  // får den under seg. Holdes alltid innenfor vinduet.
  const beside = rect.left < 320 && rect.top > 130;
  const left = beside
    ? rect.right + 10
    : Math.max(8, Math.min(rect.left, window.innerWidth - WIDTH - 8));
  const top = beside ? Math.max(8, Math.min(rect.top, window.innerHeight - 260)) : rect.bottom + 8;

  return (
    <div className="help-hover" style={{ left, top, width: WIDTH }}>
      <div className="help-hover-title">
        <strong>{help.title}</strong>
        {help.shortcut && <kbd>{help.shortcut}</kbd>}
      </div>
      <p>{help.summary}</p>
      <ol>
        {help.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {help.tip && (
        <p className="help-tip">
          <Lightbulb size={13} />
          <span>{help.tip}</span>
        </p>
      )}
    </div>
  );
}
