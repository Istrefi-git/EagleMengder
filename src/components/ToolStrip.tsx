import {
  ArrowRightLeft,
  Circle,
  Cloud,
  Highlighter,
  LandPlot,
  MessageSquareText,
  Minus,
  MoveUpRight,
  Pentagon,
  Square,
  Tag as TagIcon,
  TextCursorInput,
  Type,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStore } from '../store';
import type { ToolMode } from '../types';

const GROUPS: { heading: string; tools: { mode: ToolMode; label: string; icon: LucideIcon; title?: string }[] }[] = [
  {
    heading: 'Verktøy',
    tools: [
      { mode: 'tag', label: 'Tag', icon: TagIcon },
      { mode: 'measure:distance', label: 'Avstand', icon: ArrowRightLeft, title: 'Avstand (A)' },
      { mode: 'measure:area', label: 'Areal', icon: LandPlot },
      { mode: 'annotation:line', label: 'Linje', icon: Minus },
      { mode: 'annotation:arrow', label: 'Pil', icon: MoveUpRight },
      { mode: 'annotation:ellipse', label: 'Ellipse', icon: Circle },
      { mode: 'annotation:rect', label: 'Rektangel', icon: Square },
      { mode: 'annotation:polygon', label: 'Polygon', icon: Pentagon },
      { mode: 'annotation:highlight', label: 'Marker', icon: Highlighter },
    ],
  },
  {
    heading: 'Tekst & skyer',
    tools: [
      { mode: 'annotation:text', label: 'Tekst', icon: Type },
      { mode: 'annotation:textbox', label: 'Tekstboks', icon: TextCursorInput },
      { mode: 'annotation:callout', label: 'Melding', icon: MessageSquareText },
      { mode: 'annotation:cloud', label: 'Sky', icon: Cloud },
    ],
  },
];

/** Vannrett verktøystripe rett under toppbaren – måle-/markup-verktøyene («Verktøy»
 * og «Tekst & skyer») som tidligere lå nederst i venstremenyen og gjorde den for lang.
 * Samme `setTool`-kall som før; kun plasseringen er ny. */
export function ToolStrip() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const disabled = !useStore((s) => s.pdfDoc);

  return (
    <div className="tool-strip">
      {GROUPS.map((g) => (
        <div className="tool-strip-group" key={g.heading}>
          <span className="tool-strip-heading">{g.heading}</span>
          {g.tools.map(({ mode, label, icon: Icon, title }) => (
            <button
              key={mode}
              className={`tool-strip-btn ${tool === mode ? 'active' : ''}`}
              onClick={() => setTool(tool === mode ? 'select' : mode)}
              disabled={disabled}
              title={title ?? label}
              data-help={mode}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
