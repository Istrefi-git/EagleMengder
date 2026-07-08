import { Circle, Group, Rect } from 'react-konva';

interface PipeTubeProps {
  points: number[];
  diameterPx: number;
  color: string;
}

/** Tegner et rør-segment som en skyggelagt 3D-sylinder (à la AutoCAD), med
 * pikselbredde som speiler den valgte dimensjonen og gjeldende målestokk. Hvert
 * linjesegment skygges med en gradient vinkelrett på sin egen retning (i sitt eget
 * roterte lokalrom), og hvert punkt får en kulerundet skjøt slik at bend ser
 * sammenhengende ut. */
export function PipeTube({ points, diameterPx, color }: PipeTubeProps) {
  if (points.length < 4 || diameterPx <= 0) return null;
  const radius = diameterPx / 2;
  const dark = shade(color, -55);
  const light = shade(color, 65);

  const segments: { x: number; y: number; length: number; angle: number }[] = [];
  for (let i = 0; i + 3 < points.length; i += 2) {
    const x0 = points[i];
    const y0 = points[i + 1];
    const x1 = points[i + 2];
    const y1 = points[i + 3];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.hypot(dx, dy);
    if (length < 0.0001) continue;
    segments.push({ x: x0, y: y0, length, angle: (Math.atan2(dy, dx) * 180) / Math.PI });
  }

  const jointCount = points.length / 2;

  return (
    <Group listening={false}>
      {segments.map((seg, i) => (
        <Rect
          key={i}
          x={seg.x}
          y={seg.y}
          width={seg.length}
          height={diameterPx}
          offsetY={radius}
          rotation={seg.angle}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: 0, y: diameterPx }}
          fillLinearGradientColorStops={[0, dark, 0.3, light, 0.55, color, 1, dark]}
        />
      ))}
      {Array.from({ length: jointCount }, (_, i) => (
        <Circle
          key={i}
          x={points[i * 2]}
          y={points[i * 2 + 1]}
          radius={radius}
          fillRadialGradientStartPoint={{ x: -radius * 0.35, y: -radius * 0.35 }}
          fillRadialGradientStartRadius={0}
          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
          fillRadialGradientEndRadius={radius}
          fillRadialGradientColorStops={[0, light, 0.55, color, 1, dark]}
        />
      ))}
    </Group>
  );
}

/** Lysner (positiv prosent) eller mørker (negativ) en hex-farge. */
function shade(hex: string, percent: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  const t = percent < 0 ? 0 : 255;
  const p = Math.min(Math.abs(percent), 100) / 100;
  const r = num >> 16;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const nr = Math.round((t - r) * p) + r;
  const ng = Math.round((t - g) * p) + g;
  const nb = Math.round((t - b) * p) + b;
  return `#${((1 << 24) + (nr << 16) + (ng << 8) + nb).toString(16).slice(1)}`;
}
