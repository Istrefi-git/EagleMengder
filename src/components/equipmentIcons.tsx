// Verktøylinje-ikoner for utstyr som speiler de faktiske tegne-symbolene i symbols.tsx
// (SymbolGlyph), slik at «hvordan det ser ut når man tegner det inn» og «hvordan det
// vises i venstre meny» er samme visuelle språk – i stedet for generiske Lucide-ikoner
// som ikke ligner de faktiske VVS-symbolene.

interface IconProps {
  size?: number;
}

/** Stående rektangel med diagonal spjeldblad-strek + dreiepunkt – samme grunnform
 * som DamperBase i symbols.tsx. Brukes for vanlig spjeld og reguleringsspjeld. */
export function DamperIcon({ size = 17 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="8" y="3" width="8" height="18" />
      <line x1="8" y1="21" x2="16" y2="3" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LabeledDamperIcon({ size = 17, label }: IconProps & { label: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="18" />
      <line x1="3" y1="21" x2="10" y2="3" />
      <circle cx="6.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <line x1="10" y1="12" x2="13.3" y2="12" />
      <circle cx="18" cy="12" r="4.3" />
      <text
        x="18"
        y="12.7"
        fontSize="6"
        fontWeight="700"
        textAnchor="middle"
        stroke="none"
        fill="currentColor"
      >
        {label}
      </text>
    </svg>
  );
}

/** VAV-spjeld: spjeldblad + «V»-sirkel koblet til dreiepunktet, à la referansearket. */
export function VavDamperIcon({ size = 17 }: IconProps) {
  return <LabeledDamperIcon size={size} label="V" />;
}

/** CAV-spjeld: spjeldblad + «C»-sirkel koblet til dreiepunktet. */
export function CavDamperIcon({ size = 17 }: IconProps) {
  return <LabeledDamperIcon size={size} label="C" />;
}

/** Brannspjeld: spjeldblad + «B»-sirkel, samme visuelle familie som VAV/CAV. */
export function FireDamperIcon({ size = 17 }: IconProps) {
  return <LabeledDamperIcon size={size} label="B" />;
}

/** Lydfelle: boks med forskjøvne bafler (to fra topp, én fra bunn imellom) – speiler
 * silencer-glyphen på lerretet. */
export function SilencerIcon({ size = 17 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="6" width="20" height="12" />
      <line x1="8" y1="6" x2="8" y2="14" />
      <line x1="15" y1="6" x2="15" y2="14" />
      <line x1="11.5" y1="18" x2="11.5" y2="10" />
    </svg>
  );
}

/** Vifte: sirkel med innskrevet vifteblad-trekant + liten motorboks på toppen. */
export function FanIcon({ size = 17 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9.5" y="1.5" width="5" height="2.6" />
      <line x1="12" y1="4.1" x2="12" y2="6.5" />
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M 8.5 10 L 16 13.5 L 8.5 17 Z" />
    </svg>
  );
}

/** Bowtie-/sommerfuglventil – grunnform for rørventiler. `filled` markerer én av
 * trekantene solid (tilbakeslags-/shuntventil), `actuator` legger til aktuator over. */
function BowtieValveIcon({
  size = 17,
  filled,
  actuator,
}: IconProps & { filled?: boolean; actuator?: 'bracket' | 'motor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M 4 6 L 4 18 L 12 12 Z" fill={filled ? 'currentColor' : 'none'} />
      <path d="M 20 6 L 20 18 L 12 12 Z" />
      {actuator === 'bracket' && <rect x="10" y="1.5" width="4" height="4" />}
      {actuator === 'motor' && (
        <>
          <line x1="12" y1="8.5" x2="12" y2="4" />
          <circle cx="12" cy="3" r="2.6" fill="#fff" />
          <text x="12" y="3.7" fontSize="3.6" fontWeight="700" textAnchor="middle" stroke="none" fill="currentColor">
            M
          </text>
        </>
      )}
    </svg>
  );
}

/** Stengeventil: ren bowtie-ventil, ingen aktuator. */
export function ShutoffValveIcon({ size = 17 }: IconProps) {
  return <BowtieValveIcon size={size} />;
}

/** Reguleringsventil: bowtie-ventil + aktuator-bøyle. */
export function ControlValveIcon({ size = 17 }: IconProps) {
  return <BowtieValveIcon size={size} actuator="bracket" />;
}

/** Motorventil: bowtie-ventil + «M»-aktuator. */
export function MotorValveIcon({ size = 17 }: IconProps) {
  return <BowtieValveIcon size={size} actuator="motor" />;
}

/** Tilbakeslagsventil: bowtie-ventil med én fylt trekant (strømningsretning). */
export function CheckValveIcon({ size = 17 }: IconProps) {
  return <BowtieValveIcon size={size} filled />;
}

/** Shuntventil: bowtie-ventil med fylt trekant + «M»-aktuator (motorisert). */
export function ShuntValveIcon({ size = 17 }: IconProps) {
  return <BowtieValveIcon size={size} filled actuator="motor" />;
}
