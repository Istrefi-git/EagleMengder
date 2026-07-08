// Kjernetyper for mengdeuttak-applikasjonen.
//
// Rør/kanaler er organisert i et hierarki etter NS 3451-inspirerte
// bygningsdeler:  Hovedkategori → Underkategori → Materiale (rørtype).

export type SymbolType =
  | 'tee'
  | 'shutoff_valve'
  | 'control_valve'
  | 'motor_valve'
  | 'check_valve'
  | 'shunt_valve'
  | 'damper'
  | 'vav_damper'
  | 'cav_damper'
  | 'control_damper'
  | 'fire_damper'
  | 'silencer'
  | 'supply_diffuser'
  | 'extract_diffuser'
  | 'fan';

export type AnnotationType = 'text' | 'cloud';

export type MeasurementType = 'distance' | 'area';

export type ToolMode =
  | 'select'
  | 'pan'
  | 'calibrate'
  | 'tag'
  | `line:${string}` // line:<underkategori-id>
  | `symbol:${SymbolType}`
  | `annotation:${AnnotationType}`
  | `measure:${MeasurementType}`;

export interface SubCategoryDef {
  /** Unik id, f.eks. "31.vv" */
  id: string;
  label: string;
  color: string;
  /** Tilgjengelige materialer/rørtyper for denne underkategorien */
  materials: string[];
  /** Tilgjengelige dimensjoner */
  dimensions: string[];
}

export interface CategoryDef {
  /** Bygningsdelskode, f.eks. "31" */
  code: string;
  label: string;
  /** rør (lengde som rørlengde) eller kanal (kanallengde) */
  kind: 'pipe' | 'duct';
  subs: SubCategoryDef[];
}

/** Definisjon av et konfigurerbart felt på et utstyrssymbol (vises i egenskapspanelet/tooltip). */
export interface SymbolFieldDef {
  key: string;
  label: string;
  kind: 'select' | 'number' | 'text';
  options?: string[];
  unit?: string;
  default: string | number;
  /** Lar brukeren legge til egendefinerte verdier utover `options` (samme mønster som
   * egendefinerte kanal-/rørdimensjoner), lagret i store.symbolDimensions[type]. */
  customizable?: boolean;
}

export interface SymbolDef {
  type: SymbolType;
  label: string;
  fields: SymbolFieldDef[];
  /** Hvilken type system utstyret typisk monteres i – styrer gruppering i verktøylinjens Komponenter-seksjon. */
  kind: 'pipe' | 'duct';
}

export interface LineEntity {
  id: string;
  page: number;
  /** Referanse til underkategori (impliserer hovedkategori) */
  subId: string;
  material: string;
  dimension: string;
  /** Flate punktliste [x0, y0, x1, y1, ...] i PDF-bildets pikselrom */
  points: number[];
  /** Valgfri egendefinert systemkode (f.eks. «360.001»), satt opp i Innstillinger */
  systemId?: string;
}

export interface SymbolEntity {
  id: string;
  page: number;
  type: SymbolType;
  x: number;
  y: number;
  rotation: number;
  /** Fritt konfigurerbare egenskaper, jf. SYMBOL_DEFS[type].fields (dimensjon, lengde, vannmengde, osv). */
  props: Record<string, string | number>;
  /** Id til røret/kanalen utstyret er montert i, hvis plassert ved å klikke på en tegnet linje. */
  mountedLineId?: string;
  /** Valgfri egendefinert systemkode (f.eks. «360.001»), satt opp i Innstillinger */
  systemId?: string;
}

/** Avgreiningstype som settes inn automatisk når man tegner en ny linje videre fra et eksisterende rør/kanal. */
export type BranchFittingType = 'tee' | 'wye45' | 'tee_duct' | 'saddle_tap';

/** Automatisk generert avgreining der en ny linje starter/ender på et punkt midt på en eksisterende linje. */
export interface BranchEntity {
  id: string;
  page: number;
  /** Underkategori/materiale/dimensjon for hovedrøret/-kanalen som det grenes av fra */
  subId: string;
  material: string;
  dimension: string;
  /** Dimensjon på den nye grenen */
  branchDimension: string;
  fittingType: BranchFittingType;
  x: number;
  y: number;
  /** Hovedrørets retning (grader) ved avgreiningspunktet, brukt til visning */
  angleDeg: number;
}

/** Automatisk generert bend-markør der retningen endrer seg mellom to sammenhengende
 * rette rør-/kanalsegmenter (hvert rett segment er sin egen LineEntity, à la Revit). */
export interface BendEntity {
  id: string;
  page: number;
  subId: string;
  material: string;
  dimension: string;
  x: number;
  y: number;
  /** Klassifisert bend-vinkel (nærmeste standardvinkel), i grader */
  angleDeg: number;
}

/** Automatisk generert overgang (reduksjon/utvidelse) der dimensjon endres midt i en tegnet linje */
export interface TransitionEntity {
  id: string;
  page: number;
  subId: string;
  material: string;
  fromDimension: string;
  toDimension: string;
  x: number;
  y: number;
}

/** Frittstående markup på tegningen – tekstboks eller revisjonssky, à la en
 * PDF-leser/markup-verktøy. Påvirker ikke mengdelisten. */
export interface AnnotationEntity {
  id: string;
  page: number;
  type: AnnotationType;
  x: number;
  y: number;
  color: string;
  rotation: number;
  /** Tekst-annotasjon */
  text?: string;
  fontSize?: number;
  /** Sky-annotasjon (bounding box-størrelse + strøkbredde) */
  width?: number;
  height?: number;
  strokeWidth?: number;
}

/** Merkelapp (tag) med leaderlinje, festet til et rør/kanal – viser rørtype +
 * dimensjon for rør, kun dimensjon for kanaler. Teksten er ikke lagret på selve
 * taggen, men slås opp fra den tilknyttede linjen ved rendering, slik at den alltid
 * viser riktig verdi selv om linjens dimensjon/materiale endres senere. */
export interface TagEntity {
  id: string;
  page: number;
  /** Id til røret/kanalen taggen er festet til */
  lineId: string;
  /** Ankerpunkt på selve røret/kanalen (der leaderlinjen starter) */
  x: number;
  y: number;
  /** Posisjon for selve tag-boksen (der leaderlinjen ender og teksten vises) */
  labelX: number;
  labelY: number;
}

/** Teksten en tag skal vise for en gitt linje – rørtype + dimensjon for rør,
 * kun dimensjon for kanaler (ventilasjon har ingen «rørtype» å vise). */
export function tagLabel(line: LineEntity): string {
  return isDuctSub(line.subId) ? line.dimension : `${line.material} · ${line.dimension}`;
}

/** Frittstående målepunkt/areal-måling («linjal»-verktøy) – punkt-til-punkt avstand
 * eller et lukket rom-polygon for arealmåling. Rent visuelt hjelpemiddel, påvirker
 * ikke mengdelisten. */
export interface MeasurementEntity {
  id: string;
  page: number;
  type: MeasurementType;
  /** Punkter i bildets pikselrom – 2 punkter (4 tall) for avstand, ≥3 punkter for et lukket rom-polygon */
  points: number[];
}

export interface ScaleState {
  /** Reelle meter per piksel i bildets koordinatrom. null = ikke satt. */
  metersPerPixel: number | null;
  label: string;
  source: 'none' | 'manual' | 'calibrated' | 'auto';
}

// ── Materialsett (gjenbrukes på tvers av underkategorier) ───────────────────

const TAPPEVANN_MAT = ['Kobber', 'Rustfritt stål', 'PEX', 'PEX-AL-PEX (kompositt)', 'PP-R'];
const AVLOP_MAT = ['PP (polypropylen)', 'Støpejern (SML)', 'PVC', 'PE (sveiset)'];
const VARME_MAT = ['Stål (sort)', 'Kobber', 'PEX', 'PE-RT', 'PEX-AL (kompositt)'];
const KJOLE_MAT = ['Stål (sort)', 'Kobber', 'Rustfritt stål', 'PE'];
const KANAL_MAT = ['Spirokanal (stål)', 'Rektangulær kanal (stål)', 'Flekskanal', 'Isolert spiro'];

// ── Dimensjonssett ──────────────────────────────────────────────────────────

const TAPPEVANN_DIM = ['DN10', 'DN12', 'DN15', 'DN18', 'DN22', 'DN28', 'DN35', 'DN42', 'DN54'];
const AVLOP_DIM = ['Ø32', 'Ø40', 'Ø50', 'Ø75', 'Ø110', 'Ø160'];
const VARME_DIM = ['DN10', 'DN15', 'DN20', 'DN25', 'DN32', 'DN40', 'DN50', 'DN65', 'DN80', 'DN100'];
const KJOLE_DIM = VARME_DIM;
const KANAL_DIM = [
  'Ø100', 'Ø125', 'Ø160', 'Ø200', 'Ø250', 'Ø315', 'Ø400', 'Ø500',
  '200x100', '400x200', '500x300', '600x400', '800x500',
];
const SILENCER_DIM = ['Ø125', 'Ø160', 'Ø200', 'Ø250', 'Ø315', 'Ø400', 'Ø500'];
const SILENCER_LENGTH = ['300', '500', '600', '1000'];

// ── Kategorihierarki ─────────────────────────────────────────────────────────

export const CATEGORIES: CategoryDef[] = [
  {
    code: '31',
    label: 'Sanitæranlegg',
    kind: 'pipe',
    subs: [
      { id: '31.vv', label: 'Varmtvannsrør', color: '#e8533b', materials: TAPPEVANN_MAT, dimensions: TAPPEVANN_DIM },
      { id: '31.kv', label: 'Kaldtvann', color: '#2f80ed', materials: TAPPEVANN_MAT, dimensions: TAPPEVANN_DIM },
      { id: '31.avlop', label: 'Avløpsrør', color: '#8a5a2b', materials: AVLOP_MAT, dimensions: AVLOP_DIM },
    ],
  },
  {
    code: '32',
    label: 'Varmeanlegg',
    kind: 'pipe',
    subs: [
      { id: '32.hoved', label: 'Hovedkurs', color: '#9b1c1c', materials: VARME_MAT, dimensions: VARME_DIM },
      { id: '32.radiator', label: 'Radiatorkurs', color: '#d11a2a', materials: VARME_MAT, dimensions: VARME_DIM },
      { id: '32.gulvvarme', label: 'Gulvvarmekurs', color: '#c2185b', materials: VARME_MAT, dimensions: VARME_DIM },
      { id: '32.ventbatteri', label: 'Ventilasjonskurs', color: '#e8731f', materials: VARME_MAT, dimensions: VARME_DIM },
      { id: '32.konvektor', label: 'Konvektorkurs', color: '#ad4e00', materials: VARME_MAT, dimensions: VARME_DIM },
    ],
  },
  {
    code: '37',
    label: 'Kjøleanlegg',
    kind: 'pipe',
    subs: [
      { id: '37.hoved', label: 'Hovedkurs', color: '#006064', materials: KJOLE_MAT, dimensions: KJOLE_DIM },
      { id: '37.ventbatteri', label: 'Ventilasjonskurs', color: '#00838f', materials: KJOLE_MAT, dimensions: KJOLE_DIM },
      { id: '37.baffel', label: 'Kjølebaffelkurs', color: '#0277bd', materials: KJOLE_MAT, dimensions: KJOLE_DIM },
      { id: '37.fancoil', label: 'Fancoilkurs', color: '#5e35b1', materials: KJOLE_MAT, dimensions: KJOLE_DIM },
    ],
  },
  {
    code: '36',
    label: 'Ventilasjonsanlegg',
    kind: 'duct',
    subs: [
      { id: '36.tilluft', label: 'Tilluftskanal', color: '#1e88e5', materials: KANAL_MAT, dimensions: KANAL_DIM },
      { id: '36.avtrekk', label: 'Avtrekkskanal', color: '#fb8c00', materials: KANAL_MAT, dimensions: KANAL_DIM },
      { id: '36.inntak', label: 'Inntakskanal', color: '#43a047', materials: KANAL_MAT, dimensions: KANAL_DIM },
      { id: '36.avkast', label: 'Avkastkanal', color: '#6d4c41', materials: KANAL_MAT, dimensions: KANAL_DIM },
    ],
  },
];

// ── Oppslag ───────────────────────────────────────────────────────────────

export const SUBCATEGORIES: Record<string, SubCategoryDef> = {};
const SUB_TO_CATEGORY: Record<string, CategoryDef> = {};
for (const cat of CATEGORIES) {
  for (const sub of cat.subs) {
    SUBCATEGORIES[sub.id] = sub;
    SUB_TO_CATEGORY[sub.id] = cat;
  }
}

export function categoryOf(subId: string): CategoryDef {
  return SUB_TO_CATEGORY[subId];
}

/** Slår sammen en underkategoris innebygde dimensjonssett med ev. egendefinerte
 * dimensjoner brukeren har lagt til for akkurat den underkategorien (gjelder
 * både runde Ø-dimensjoner og rektangulære BxH-dimensjoner for kanaler). */
export function mergedDimensions(sub: SubCategoryDef, customDimensions: Record<string, string[]>): string[] {
  return mergedOptions(sub.id, sub.dimensions, customDimensions);
}

/** Generisk variant av mergedDimensions – slår sammen en vilkårlig grunnliste med
 * egendefinerte verdier lagret under en vilkårlig nøkkel. Brukes bl.a. for utstyrsfelt
 * (f.eks. spjelds dimensjon), der nøkkelen er symboltypen i stedet for en underkategori-id. */
export function mergedOptions(key: string, base: string[], customDimensions: Record<string, string[]>): string[] {
  const custom = customDimensions[key] ?? [];
  const extra = custom.filter((d) => !base.includes(d));
  return extra.length > 0 ? [...base, ...extra] : base;
}

/** Fargen som faktisk skal brukes for en underkategori – brukerens egendefinerte
 * farge (satt i verktøylinjen) hvis satt, ellers standardfargen fra katalogen. */
export function colorFor(sub: SubCategoryDef, customColors: Record<string, string>): string {
  return customColors[sub.id] ?? sub.color;
}

export function isDuctSub(subId: string): boolean {
  return SUB_TO_CATEGORY[subId]?.kind === 'duct';
}

// ── Visningsstil for rør/kanaler ────────────────────────────────────────────
//
// 'cylinder' tegner rør/kanaler som skyggelagte 3D-sylindere (PipeTube,
// AutoCAD-aktig). 'flat' tegner dem som enkle fargede streker (med symboler
// for bend/avgreininger/utstyr som før) – en enklere, mer skjematisk visning.

export type PipeRenderStyle = 'cylinder' | 'flat';

export const DEFAULT_PIPE_RENDER_STYLE: PipeRenderStyle = 'cylinder';

// ── Fargetema for tegneverktøyet ───────────────────────────────────────────

export type Theme = 'light' | 'dark';

export const DEFAULT_THEME: Theme = 'light';

// ── Symboler ─────────────────────────────────────────────────────────────
//
// Bend tegnes ikke som et eget symbol – det leses automatisk ut fra
// retningsendringer i en tegnet linje (se lib/geometry.ts).

const DIM_FIELD: SymbolFieldDef = { key: 'dimension', label: 'Dimensjon', kind: 'text', default: '' };

export const SYMBOL_DEFS: Record<SymbolType, SymbolDef> = {
  tee: { type: 'tee', label: 'T-rør', kind: 'pipe', fields: [DIM_FIELD] },
  shutoff_valve: {
    type: 'shutoff_valve',
    label: 'Stengeventil',
    kind: 'pipe',
    fields: [{ key: 'dn', label: 'Dimensjon', kind: 'text', default: 'DN20' }],
  },
  control_valve: {
    type: 'control_valve',
    label: 'Reguleringsventil',
    kind: 'pipe',
    fields: [
      { key: 'dn', label: 'Dimensjon', kind: 'text', default: 'DN20' },
      { key: 'flow', label: 'Vannmengde', kind: 'number', unit: 'l/s', default: 0 },
      { key: 'power', label: 'Effekt', kind: 'number', unit: 'kW', default: 0 },
    ],
  },
  motor_valve: {
    type: 'motor_valve',
    label: 'Motorventil',
    kind: 'pipe',
    fields: [
      { key: 'dn', label: 'Dimensjon', kind: 'text', default: 'DN20' },
      { key: 'flow', label: 'Vannmengde', kind: 'number', unit: 'l/s', default: 0 },
      { key: 'power', label: 'Effekt', kind: 'number', unit: 'kW', default: 0 },
    ],
  },
  check_valve: {
    type: 'check_valve',
    label: 'Tilbakeslagsventil',
    kind: 'pipe',
    fields: [{ key: 'dn', label: 'Dimensjon', kind: 'text', default: 'DN20' }],
  },
  shunt_valve: {
    type: 'shunt_valve',
    label: 'Shuntventil',
    kind: 'pipe',
    fields: [
      { key: 'dn', label: 'Dimensjon', kind: 'text', default: 'DN20' },
      { key: 'flow', label: 'Vannmengde', kind: 'number', unit: 'l/s', default: 0 },
    ],
  },
  damper: {
    type: 'damper',
    label: 'Spjeld',
    kind: 'duct',
    fields: [
      { key: 'dimension', label: 'Dimensjon', kind: 'select', options: KANAL_DIM, default: KANAL_DIM[0], customizable: true },
    ],
  },
  vav_damper: {
    type: 'vav_damper',
    label: 'VAV-spjeld',
    kind: 'duct',
    fields: [
      { key: 'dimension', label: 'Dimensjon', kind: 'select', options: KANAL_DIM, default: KANAL_DIM[0], customizable: true },
      { key: 'flow', label: 'Luftmengde', kind: 'number', unit: 'l/s', default: 0 },
    ],
  },
  cav_damper: {
    type: 'cav_damper',
    label: 'CAV-spjeld',
    kind: 'duct',
    fields: [
      { key: 'dimension', label: 'Dimensjon', kind: 'select', options: KANAL_DIM, default: KANAL_DIM[0], customizable: true },
      { key: 'flow', label: 'Luftmengde', kind: 'number', unit: 'l/s', default: 0 },
    ],
  },
  control_damper: {
    type: 'control_damper',
    label: 'Reguleringsspjeld',
    kind: 'duct',
    fields: [
      { key: 'dimension', label: 'Dimensjon', kind: 'select', options: KANAL_DIM, default: KANAL_DIM[0], customizable: true },
    ],
  },
  fire_damper: {
    type: 'fire_damper',
    label: 'Brannspjeld',
    kind: 'duct',
    fields: [
      { key: 'dimension', label: 'Dimensjon', kind: 'select', options: KANAL_DIM, default: KANAL_DIM[0], customizable: true },
    ],
  },
  silencer: {
    type: 'silencer',
    label: 'Lyddemper',
    kind: 'duct',
    fields: [
      { key: 'shape', label: 'Form', kind: 'select', options: ['Sirkulær', 'Rektangulær'], default: 'Sirkulær' },
      { key: 'dimension', label: 'Dimensjon', kind: 'select', options: SILENCER_DIM, default: SILENCER_DIM[0] },
      { key: 'length', label: 'Lengde', kind: 'select', options: SILENCER_LENGTH, default: SILENCER_LENGTH[1], unit: 'mm' },
    ],
  },
  supply_diffuser: {
    type: 'supply_diffuser',
    label: 'Tilluftventil',
    kind: 'duct',
    fields: [{ key: 'dimension', label: 'Dimensjon', kind: 'text', default: '' }],
  },
  extract_diffuser: {
    type: 'extract_diffuser',
    label: 'Avtrekksventil',
    kind: 'duct',
    fields: [{ key: 'dimension', label: 'Dimensjon', kind: 'text', default: '' }],
  },
  fan: {
    type: 'fan',
    label: 'Vifte',
    kind: 'duct',
    fields: [
      { key: 'dimension', label: 'Dimensjon', kind: 'text', default: '' },
      { key: 'flow', label: 'Luftmengde', kind: 'number', unit: 'l/s', default: 0 },
      { key: 'power', label: 'Effekt', kind: 'number', unit: 'kW', default: 0 },
    ],
  },
};

export const SYMBOL_TYPE_ORDER: SymbolType[] = [
  'tee',
  'shutoff_valve',
  'control_valve',
  'motor_valve',
  'check_valve',
  'shunt_valve',
  'damper',
  'vav_damper',
  'cav_damper',
  'control_damper',
  'supply_diffuser',
  'extract_diffuser',
  'fire_damper',
  'silencer',
  'fan',
];

/** Standardverdier for et symbols props-bag, avledet fra feltskjemaet. */
export function defaultSymbolProps(type: SymbolType): Record<string, string | number> {
  const props: Record<string, string | number> = {};
  for (const f of SYMBOL_DEFS[type].fields) props[f.key] = f.default;
  return props;
}

const BRANCH_FITTING_LABELS: Record<BranchFittingType, string> = {
  tee: 'T-rør',
  wye45: '45° grenrør',
  tee_duct: 'T-kanal',
  saddle_tap: 'Påstikk',
};

export function branchFittingLabel(type: BranchFittingType): string {
  return BRANCH_FITTING_LABELS[type];
}

/** Avleder hvilken avgreiningstype som automatisk skal brukes for en rør-underkategori (kanaler velges manuelt). */
export function defaultBranchFittingForPipe(subId: string): BranchFittingType {
  return subId === '31.avlop' ? 'wye45' : 'tee';
}

// ── Bend-vinkler ─────────────────────────────────────────────────────────
//
// Standard sett av bend-vinkler en bruker kan snappe til ved å holde Shift
// under tegning. Rigide materialer med kapillær/pressfittings (kobber,
// rustfritt stål, sveiset PP-R) leveres normalt kun med 45°/90°-vinkelrør.
// Avløpsrør i PP/støpejern/PVC har et standard vinkelsortiment på
// 15/30/45/90 (ikke 60). Fleksible rør (PEX/PEX-AL/PE-RT), sveiset stål/PE
// og kanaler kan formes/skjøtes i alle fem standardvinklene.

export const ALL_BEND_ANGLES = [15, 30, 45, 60, 90] as const;

const RESTRICTED_BEND_ANGLES: Record<string, number[]> = {
  Kobber: [45, 90],
  'Rustfritt stål': [45, 90],
  'PP-R': [45, 90],
  'PP (polypropylen)': [15, 30, 45, 90],
  'Støpejern (SML)': [15, 30, 45, 90],
  PVC: [15, 30, 45, 90],
};

/** Hvilke bend-vinkler som er tilgjengelige for Shift-snapping for et gitt materiale. */
export function getBendAngles(material: string): number[] {
  return RESTRICTED_BEND_ANGLES[material] ?? [...ALL_BEND_ANGLES];
}

// ── Standardlengder / automatiske skjøter ────────────────────────────────
//
// Kanaler (spiro/rektangulær) leveres normalt i standardlengder og skjøtes med
// nippel. Rør leveres normalt i standardlengder og skjøtes med muffe. Hvilken
// standardlengde som brukes er konfigurerbar (se store.ts: standardLengths,
// satt via innstillingsdialogen). Når en tegnet linje er lengre enn
// standardlengden, beregnes automatisk hvor mange skjøter som trengs for å
// dele opp lengden i standardlengder.

export const DUCT_LENGTH_OPTIONS_MM = [1150, 2400, 3000];
export const PIPE_LENGTH_OPTIONS_MM = [3000, 6000];

export const DEFAULT_STANDARD_LENGTHS: Record<'pipe' | 'duct', number> = {
  pipe: 6000,
  duct: 3000,
};

export function jointLabel(kind: 'pipe' | 'duct'): string {
  return kind === 'duct' ? 'Nippel' : 'Muffe';
}

/** Antall skjøter (nippel/muffe) som trengs for å dele en lengde opp i standardlengder. */
export function jointCountForLength(lengthMm: number, standardMm: number): number {
  if (!Number.isFinite(lengthMm) || !standardMm || lengthMm <= standardMm) return 0;
  return Math.max(0, Math.ceil(lengthMm / standardMm) - 1);
}
