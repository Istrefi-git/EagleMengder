import type { GlyphShapeId } from '../types';

interface Props {
  shape: GlyphShapeId;
  color?: string;
  size?: number;
}

/** DOM/SVG-variant av GenericGlyph (symbols.tsx) – brukes i vanlig HTML-UI
 * (symbolbiblioteket, verktøylinjens ikon-grid, «lag ny komponent»-dialogen) der en
 * Konva-komponent ikke kan rendres uten en <Stage>. Rendrer de samme grunnformene
 * som symbols.tsx sin GenericGlyph, bare som rått SVG. */
export function GlyphPreview({ shape, color = '#1f2933', size = 18 }: Props) {
  const sw = 2;
  switch (shape) {
    case 'circle':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth={sw} />
        </svg>
      );
    case 'box':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <rect x="3" y="6" width="18" height="12" fill="none" stroke={color} strokeWidth={sw} />
        </svg>
      );
    case 'diamond':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <polygon points="12,3 21,12 12,21 3,12" fill="none" stroke={color} strokeWidth={sw} />
        </svg>
      );
    case 'triangle':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <polygon points="12,3 21,19 3,19" fill="none" stroke={color} strokeWidth={sw} />
        </svg>
      );
    case 'cross':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <line x1="3" y1="12" x2="21" y2="12" stroke={color} strokeWidth={sw} />
          <line x1="12" y1="3" x2="12" y2="21" stroke={color} strokeWidth={sw} />
        </svg>
      );
    case 'cap_end':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <line x1="3" y1="12" x2="21" y2="12" stroke={color} strokeWidth={sw} />
          <line x1="17" y1="6" x2="17" y2="18" stroke={color} strokeWidth={sw} />
        </svg>
      );
    case 'valve_bowtie':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <polygon points="3,4 3,20 12,12" fill="none" stroke={color} strokeWidth={sw} />
          <polygon points="21,4 21,20 12,12" fill="none" stroke={color} strokeWidth={sw} />
        </svg>
      );
    case 'valve_bowtie_filled':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <polygon points="3,4 3,20 12,12" fill={color} stroke={color} strokeWidth={sw} />
          <polygon points="21,4 21,20 12,12" fill="none" stroke={color} strokeWidth={sw} />
        </svg>
      );
    case 'damper':
    case 'damper_labeled':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <rect x="8" y="2" width="8" height="20" fill="none" stroke={color} strokeWidth={sw} />
          <line x1="8" y1="22" x2="16" y2="2" stroke={color} strokeWidth={sw} />
        </svg>
      );
    case 'diffuser':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" fill="none" stroke={color} strokeWidth={sw} />
          <circle cx="12" cy="12" r="3" fill="none" stroke={color} strokeWidth={1.5} />
        </svg>
      );
    case 'silencer_box':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <rect x="2" y="7" width="20" height="10" fill="none" stroke={color} strokeWidth={sw} />
        </svg>
      );
    case 'fan':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth={sw} />
          <polygon points="9,9 17,12 9,15" fill="none" stroke={color} strokeWidth={1.5} />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth={sw} />
        </svg>
      );
  }
}
