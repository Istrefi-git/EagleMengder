import { Arrow, Circle, Group, Line, Rect, Text } from 'react-konva';
import type { BranchFittingType, SymbolType } from '../types';

const BASE = '#1f2933';
const SEL = '#f5a623';

interface Props {
  type: SymbolType;
  selected: boolean;
  /** Vis luftrettings-piler på tilluft-/avtrekksventiler (styres i Innstillinger). */
  showArrows?: boolean;
  /** Egendefinert strekfarge (brukes bl.a. for at tilluft-/avtrekksventiler skal ha
   * samme farge som tilhørende kanal). Overstyres av valgt-tilstand (oransje). */
  color?: string;
}

/** Tilluft-/avtrekksventil: firkantet diffusor-symbol (plan-visning av takdiffusor)
 * med diagonale piler ut fra hjørnene (tilluft=utover, avtrekk=innover). */
function DiffuserGlyph({ stroke, r, outward, showArrows }: { stroke: string; r: number; outward: boolean; showArrows: boolean }) {
  const s = r * 1.1; // halvside av kvadraten
  const arrowFrom = s * 0.3;
  const arrowTo = s * 1.5;
  return (
    <Group>
      <Rect x={-s} y={-s} width={s * 2} height={s * 2} stroke={stroke} strokeWidth={2} />
      <Circle radius={s * 0.32} stroke={stroke} strokeWidth={1.5} />
      {showArrows &&
        [45, 135, 225, 315].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const from = outward ? arrowFrom : arrowTo;
          const to = outward ? arrowTo : arrowFrom;
          return (
            <Arrow
              key={deg}
              points={[cos * from, sin * from, cos * to, sin * to]}
              stroke={stroke}
              fill={stroke}
              strokeWidth={1.6}
              pointerLength={4}
              pointerWidth={3}
            />
          );
        })}
    </Group>
  );
}

/** Bowtie-/sommerfuglventil-symbol – to trekanter som møtes i sentrum, standard
 * ventilsymbol for rørkomponenter. `filledSide` fyller én av trekantene solid
 * (brukt for tilbakeslags-/shuntventil, som viser retning). */
function ValveBowtie({
  stroke,
  r,
  selected,
  filledSide,
}: {
  stroke: string;
  r: number;
  selected: boolean;
  filledSide?: 'left' | 'right';
}) {
  const unfilled = selected ? 'rgba(245,166,35,0.15)' : 'rgba(31,41,51,0.06)';
  return (
    <Group>
      <Line
        points={[-r, -r * 0.8, -r, r * 0.8, 0, 0]}
        closed
        stroke={stroke}
        strokeWidth={2}
        fill={filledSide === 'left' ? stroke : unfilled}
      />
      <Line
        points={[r, -r * 0.8, r, r * 0.8, 0, 0]}
        closed
        stroke={stroke}
        strokeWidth={2}
        fill={filledSide === 'right' ? stroke : unfilled}
      />
    </Group>
  );
}

/** «M»-aktuator-sirkel over en ventil, koblet med en kort strek – motorventil/shuntventil. */
function MotorMark({ stroke, r }: { stroke: string; r: number }) {
  const cy = -r * 1.7;
  return (
    <Group>
      <Line points={[0, -r * 0.85, 0, cy + r * 0.5]} stroke={stroke} strokeWidth={1.6} />
      <Circle x={0} y={cy} radius={r * 0.5} stroke={stroke} strokeWidth={1.6} fill="#fff" />
      <Text
        text="M"
        x={-r * 0.5}
        y={cy - r * 0.22}
        width={r}
        align="center"
        fontSize={r * 0.4}
        fontStyle="bold"
        fill={stroke}
      />
    </Group>
  );
}

/** Stående rektangel med diagonal spjeldblad-strek + dreiepunkt (dott) – standard
 * spjeld-symbol. VAV/CAV/brannspjeld får en liten bokstav-sirkel til side, koblet
 * til dreiepunktet med en kort strek (à la aktuator-referanse). Reguleringsspjeld
 * og vanlig spjeld har ingen sirkel. */
function DamperBase({ stroke, r, sideLabel }: { stroke: string; r: number; sideLabel?: string }) {
  const halfW = r * 0.5;
  const halfH = r * 1.05;
  return (
    <Group>
      <Rect x={-halfW} y={-halfH} width={halfW * 2} height={halfH * 2} stroke={stroke} strokeWidth={1.6} />
      <Line points={[-halfW, halfH, halfW, -halfH]} stroke={stroke} strokeWidth={1.6} />
      <Circle x={0} y={0} radius={r * 0.11} fill={stroke} />
      {sideLabel && (
        <Group>
          <Line points={[halfW, 0, halfW + r * 0.45, 0]} stroke={stroke} strokeWidth={1.4} />
          <Circle
            x={halfW + r * 0.85}
            y={0}
            radius={r * 0.4}
            stroke={stroke}
            strokeWidth={1.4}
            fill="#fff"
          />
          <Text
            text={sideLabel}
            x={halfW + r * 0.85 - r * 0.4}
            y={-r * 0.17}
            width={r * 0.8}
            align="center"
            fontSize={r * 0.26}
            fontStyle="bold"
            fill={stroke}
          />
        </Group>
      )}
    </Group>
  );
}

/**
 * Tegner et symbol sentrert i (0,0). Plassering/rotasjon/skala settes på
 * Group-en utenfor (i SymbolNode). Bruker enkle, gjenkjennbare VVS-symboler.
 */
export function SymbolGlyph({ type, selected, showArrows = true, color }: Props) {
  const stroke = selected ? SEL : (color ?? BASE);
  const sw = 2;
  const r = 11;

  switch (type) {
    case 'tee':
      // T-rør: vannrett linje + nedre stubb
      return (
        <Group>
          <Line points={[-r, -r * 0.4, r, -r * 0.4]} stroke={stroke} strokeWidth={sw} />
          <Line points={[0, -r * 0.4, 0, r]} stroke={stroke} strokeWidth={sw} />
        </Group>
      );
    case 'shutoff_valve':
      // Stengeventil: bowtie-ventil, ingen aktuator
      return <ValveBowtie stroke={stroke} r={r} selected={selected} />;
    case 'control_valve':
      // Reguleringsventil: bowtie-ventil + aktuator-bøyle
      return (
        <Group>
          <ValveBowtie stroke={stroke} r={r} selected={selected} />
          <Rect x={-3} y={-r - 6} width={6} height={6} stroke={stroke} strokeWidth={1.5} />
        </Group>
      );
    case 'motor_valve':
      // Motorventil: bowtie-ventil + «M»-aktuator
      return (
        <Group>
          <ValveBowtie stroke={stroke} r={r} selected={selected} />
          <MotorMark stroke={stroke} r={r} />
        </Group>
      );
    case 'check_valve':
      // Tilbakeslagsventil: bowtie-ventil med én fylt trekant (viser tillatt strømningsretning)
      return <ValveBowtie stroke={stroke} r={r} selected={selected} filledSide="left" />;
    case 'shunt_valve':
      // Shuntventil: bowtie-ventil med fylt trekant + «M»-aktuator (motorisert 3-veis)
      return (
        <Group>
          <ValveBowtie stroke={stroke} r={r} selected={selected} filledSide="left" />
          <MotorMark stroke={stroke} r={r} />
        </Group>
      );
    case 'damper':
      return <DamperBase stroke={stroke} r={r} />;
    case 'vav_damper':
      return <DamperBase stroke={stroke} r={r} sideLabel="VAV" />;
    case 'cav_damper':
      return <DamperBase stroke={stroke} r={r} sideLabel="CAV" />;
    case 'control_damper':
      return <DamperBase stroke={stroke} r={r} />;
    case 'fire_damper':
      return <DamperBase stroke={stroke} r={r} sideLabel="B" />;
    case 'silencer':
      // Lyddemper: rektangulær boks med forskjøvne bafler (to fra topp, én fra bunn
      // imellom) – klassisk lydfelle-symbol for kanaler.
      return (
        <Group>
          <Rect
            x={-r * 1.5}
            y={-r * 0.85}
            width={r * 3}
            height={r * 1.7}
            stroke={stroke}
            strokeWidth={sw}
            fill={selected ? 'rgba(245,166,35,0.12)' : 'rgba(180,180,180,0.12)'}
          />
          <Line points={[-r * 0.55, -r * 0.85, -r * 0.55, r * 0.35]} stroke={stroke} strokeWidth={sw} listening={false} />
          <Line points={[r * 0.3, -r * 0.85, r * 0.3, r * 0.35]} stroke={stroke} strokeWidth={sw} listening={false} />
          <Line points={[-r * 0.12, r * 0.85, -r * 0.12, -r * 0.35]} stroke={stroke} strokeWidth={sw} listening={false} />
        </Group>
      );
    case 'supply_diffuser':
      return <DiffuserGlyph stroke={stroke} r={r} outward showArrows={showArrows} />;
    case 'extract_diffuser':
      return <DiffuserGlyph stroke={stroke} r={r} outward={false} showArrows={showArrows} />;
    case 'fan':
      // Vifte: sirkel med innskrevet vifteblad-trekant + motorboks på toppen
      return (
        <Group>
          <Rect x={-r * 0.35} y={-r * 1.75} width={r * 0.7} height={r * 0.4} stroke={stroke} strokeWidth={1.6} />
          <Line
            points={[-r * 0.18, -r * 1.58, 0, -r * 1.68, r * 0.18, -r * 1.58]}
            stroke={stroke}
            strokeWidth={1.2}
            lineCap="round"
            lineJoin="round"
          />
          <Line points={[0, -r * 1.35, 0, -r]} stroke={stroke} strokeWidth={1.6} />
          <Circle radius={r} stroke={stroke} strokeWidth={sw} />
          <Line
            points={[-r * 0.55, -r * 0.55, r * 0.7, 0, -r * 0.55, r * 0.55]}
            closed
            stroke={stroke}
            strokeWidth={1.6}
            fill={selected ? 'rgba(245,166,35,0.15)' : 'transparent'}
          />
        </Group>
      );
    case 'air_handling_unit':
      // Ventilasjonsaggregat: rektangulær kasse med seksjonsdelere + vifte-/batteri-hint.
      // Tegnes i nominell 2r×2r-boks slik at ikke-uniform skalering (scaleX/scaleY i
      // SymbolNode) strekker den til oppgitt bredde × lengde.
      return (
        <Group>
          <Rect
            x={-r}
            y={-r}
            width={r * 2}
            height={r * 2}
            stroke={stroke}
            strokeWidth={sw}
            fill={selected ? 'rgba(245,166,35,0.10)' : 'transparent'}
          />
          <Line points={[-r * 0.33, -r, -r * 0.33, r]} stroke={stroke} strokeWidth={1} />
          <Line points={[r * 0.33, -r, r * 0.33, r]} stroke={stroke} strokeWidth={1} />
          {/* Vifte i høyre seksjon */}
          <Circle x={r * 0.66} radius={r * 0.3} stroke={stroke} strokeWidth={1.2} />
          {/* Batteri-hint (kryss) i venstre seksjon */}
          <Line points={[-r * 0.85, -r * 0.5, -r * 0.47, r * 0.5]} stroke={stroke} strokeWidth={1} />
          <Line points={[-r * 0.85, r * 0.5, -r * 0.47, -r * 0.5]} stroke={stroke} strokeWidth={1} />
        </Group>
      );
    default:
      return null;
  }
}

/** Tegner en automatisk avgreiningsdel (T-rør/45°-grenrør/påstikk/T-kanal) ved
 * punktet der en ny linje møter et eksisterende rør/kanal. Roteres utenfra
 * (BranchMarker) til hovedrørets retning. */
export function BranchGlyph({ type, color }: { type: BranchFittingType; color: string }) {
  const r = 9;
  switch (type) {
    case 'wye45':
      return (
        <Group>
          <Line points={[-r, 0, r, 0]} stroke={color} strokeWidth={2.5} />
          <Line points={[0, 0, r * 0.9, -r * 0.9]} stroke={color} strokeWidth={2.5} />
        </Group>
      );
    case 'saddle_tap':
      return (
        <Group>
          <Line points={[-r, 0, r, 0]} stroke={color} strokeWidth={2.5} />
          <Circle x={0} y={-r * 0.5} radius={3} stroke={color} strokeWidth={2} />
        </Group>
      );
    case 'tee_duct':
      return (
        <Group>
          <Line points={[-r, 0, r, 0]} stroke={color} strokeWidth={2.5} />
          <Line points={[0, 0, 0, -r]} stroke={color} strokeWidth={2.5} />
          <Line points={[-r * 0.5, -r, r * 0.5, -r]} stroke={color} strokeWidth={2.5} />
        </Group>
      );
    default: // tee
      return (
        <Group>
          <Line points={[-r, 0, r, 0]} stroke={color} strokeWidth={2.5} />
          <Line points={[0, 0, 0, -r]} stroke={color} strokeWidth={2.5} />
        </Group>
      );
  }
}
