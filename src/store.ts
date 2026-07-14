import { create } from 'zustand';
import type {
  AnnotationEntity,
  AnnotationType,
  BendEntity,
  BranchEntity,
  BranchFittingType,
  LineEntity,
  MeasurementEntity,
  MeasurementType,
  PipeRenderStyle,
  ScaleState,
  SymbolEntity,
  SymbolType,
  TagEntity,
  Theme,
  ToolMode,
  TransitionEntity,
} from './types';
import {
  DEFAULT_PIPE_RENDER_STYLE,
  DEFAULT_STANDARD_LENGTHS,
  DEFAULT_THEME,
  SUBCATEGORIES,
  defaultSymbolProps,
} from './types';
import type { PdfDoc } from './lib/pdf';
import { detectScaleFromPdf } from './lib/pdf';
import { classifyBendAngle, lineIntersect, polylineBendAngles } from './lib/geometry';

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${idCounter++}`;

/** Finner alle linjer som er transitivt forbundet med et sett med start-id-er, via delte
 * endepunkter (samme koordinat innenfor toleranse) – brukes til å flytte en hel
 * sammenhengende rør-/kanalstrekning som én rigid enhet (se nudgeSelected), slik at
 * skjøtene ikke ryker når man flytter et enkelt segment med piltastene. */
function findConnectedLineIds(pageLines: LineEntity[], seedIds: string[], eps = 0.5): Set<string> {
  const endpointsOf = (l: LineEntity) => {
    const n = l.points.length;
    return [
      { x: l.points[0], y: l.points[1] },
      { x: l.points[n - 2], y: l.points[n - 1] },
    ];
  };
  const visited = new Set<string>();
  const queue = [...seedIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const line = pageLines.find((l) => l.id === id);
    if (!line) continue;
    const pts = endpointsOf(line);
    for (const other of pageLines) {
      if (visited.has(other.id)) continue;
      const otherPts = endpointsOf(other);
      const shares = pts.some((p) => otherPts.some((op) => Math.abs(p.x - op.x) < eps && Math.abs(p.y - op.y) < eps));
      if (shares) queue.push(other.id);
    }
  }
  return visited;
}

export interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

export type SelectedKind =
  | 'line'
  | 'symbol'
  | 'branch'
  | 'transition'
  | 'annotation'
  | 'bend'
  | 'tag'
  | 'measurement'
  | null;

export interface PendingBranchChoice {
  mainSubId: string;
  mainMaterial: string;
  mainDimension: string;
  branchDimension: string;
  x: number;
  y: number;
  angleDeg: number;
}

/** Tegnedata som angre/gjenta opererer på – verktøy/visning/tema er bevisst utelatt. */
export interface DrawSnapshot {
  lines: LineEntity[];
  symbols: SymbolEntity[];
  transitions: TransitionEntity[];
  branches: BranchEntity[];
  bends: BendEntity[];
  annotations: AnnotationEntity[];
  tags: TagEntity[];
  measurements: MeasurementEntity[];
}

const MAX_HISTORY = 50;

const SETTINGS_KEY = 'mengdemaler-settings';

interface PersistedSettings {
  pipe: number;
  duct: number;
  pipeRenderStyle: PipeRenderStyle;
  theme: Theme;
  showAirflowArrows: boolean;
  /** Skjul tekst-etiketter for komponenter (overganger/avgreininger) på lerretet. */
  hideComponentLabels: boolean;
  suppressOffLineWarning: boolean;
  customSystems: string[];
  /** Egendefinerte dimensjoner lagt til per underkategori (f.eks. runde Ø-mål eller
   * rektangulære BxH-mål for kanaler som ikke finnes i standardsettet). */
  customDimensions: Record<string, string[]>;
  /** Egendefinerte farger per underkategori (subId → hex), overstyrer standardfargen
   * i CATEGORIES-katalogen. */
  customColors: Record<string, string>;
}

function loadSettings(): PersistedSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw);
    return {
      pipe: typeof parsed.pipe === 'number' ? parsed.pipe : DEFAULT_STANDARD_LENGTHS.pipe,
      duct: typeof parsed.duct === 'number' ? parsed.duct : DEFAULT_STANDARD_LENGTHS.duct,
      pipeRenderStyle:
        parsed.pipeRenderStyle === 'flat' || parsed.pipeRenderStyle === 'cylinder'
          ? parsed.pipeRenderStyle
          : DEFAULT_PIPE_RENDER_STYLE,
      theme: parsed.theme === 'dark' ? 'dark' : DEFAULT_THEME,
      showAirflowArrows: typeof parsed.showAirflowArrows === 'boolean' ? parsed.showAirflowArrows : true,
      hideComponentLabels:
        typeof parsed.hideComponentLabels === 'boolean' ? parsed.hideComponentLabels : false,
      suppressOffLineWarning:
        typeof parsed.suppressOffLineWarning === 'boolean' ? parsed.suppressOffLineWarning : false,
      customSystems: Array.isArray(parsed.customSystems)
        ? parsed.customSystems.filter((c: unknown) => typeof c === 'string')
        : [],
      customDimensions:
        parsed.customDimensions && typeof parsed.customDimensions === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.customDimensions as Record<string, unknown>).filter(
                (entry): entry is [string, string[]] =>
                  Array.isArray(entry[1]) && entry[1].every((d) => typeof d === 'string'),
              ),
            )
          : {},
      customColors:
        parsed.customColors && typeof parsed.customColors === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.customColors as Record<string, unknown>).filter(
                (entry): entry is [string, string] => typeof entry[1] === 'string',
              ),
            )
          : {},
    };
  } catch {
    return defaultSettings();
  }
}

function defaultSettings(): PersistedSettings {
  return {
    ...DEFAULT_STANDARD_LENGTHS,
    pipeRenderStyle: DEFAULT_PIPE_RENDER_STYLE,
    theme: DEFAULT_THEME,
    showAirflowArrows: true,
    hideComponentLabels: false,
    suppressOffLineWarning: false,
    customSystems: [],
    customDimensions: {},
    customColors: {},
  };
}

function saveSettings(settings: PersistedSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignorer (f.eks. privat nettlesing uten lagringstilgang)
  }
}

/** Bygger og lagrer hele settings-blob-en fra nåværende state, med ev. felt overstyrt –
 * brukes av alle setters under så hver av dem ikke selv må huske å spre inn alle feltene. */
function persistSettings(s: AppState, overrides: Partial<PersistedSettings> = {}) {
  saveSettings({
    pipe: s.standardLengths.pipe,
    duct: s.standardLengths.duct,
    pipeRenderStyle: s.pipeRenderStyle,
    theme: s.theme,
    showAirflowArrows: s.showAirflowArrows,
    hideComponentLabels: s.hideComponentLabels,
    suppressOffLineWarning: s.suppressOffLineWarning,
    customSystems: s.customSystems,
    customDimensions: s.customDimensions,
    customColors: s.customColors,
    ...overrides,
  });
}

interface AppState {
  // Dokument
  pdfDoc: PdfDoc | null;
  fileName: string | null;
  numPages: number;
  currentPage: number;
  pageImage: HTMLCanvasElement | null;
  pageWidth: number;
  pageHeight: number;
  isLoading: boolean;
  error: string | null;

  // Målestokk
  scale: ScaleState;
  /** Resultat av automatisk PDF-tekstsøk (uavhengig av hva som er aktivt valgt) */
  autoDetected: ScaleState | null;
  isScanning: boolean;

  // Entiteter
  lines: LineEntity[];
  symbols: SymbolEntity[];
  /** Automatisk genererte overganger der dimensjon endres midt i en tegnet linje */
  transitions: TransitionEntity[];
  /** Automatisk genererte avgreiningsdeler (T-rør/45°-grenrør/påstikk/T-kanal) */
  branches: BranchEntity[];
  /** Automatisk genererte bend-markører der retningen endrer seg mellom to rette segmenter */
  bends: BendEntity[];
  /** Frittstående markup (tekst/sky) – påvirker ikke mengdelisten */
  annotations: AnnotationEntity[];
  /** Merkelapper (tags) med leaderlinje, festet til rør/kanaler – viser rørtype/dimensjon */
  tags: TagEntity[];
  /** Frittstående mål (punkt-til-punkt avstand / rom-areal) – påvirker ikke mengdelisten */
  measurements: MeasurementEntity[];

  // Verktøy / utvalg
  tool: ToolMode;
  selectedId: string | null;
  selectedKind: SelectedKind;
  /** Sist valgt materiale/dimensjon per underkategori, satt via verktøylinjens nedtrekksmeny */
  lineConfig: Record<string, { material: string; dimension: string }>;
  /** Sist brukte feltverdier (dimensjon, lengde, luftmengde osv.) per utstyrstype, satt via
   * utstyr-HUD-en før plassering – gjør at man slipper å skrive inn dimensjon på nytt for
   * hvert spjeld/ventil/lyddemper man plasserer av samme type. */
  symbolConfig: Record<string, Record<string, string | number>>;
  /** Id til symbolet musepekeren henger over, for hover-tooltip */
  hoveredSymbolId: string | null;
  /** Flervalg av linje-id-er (additivt til selectedId/selectedKind – shift-klikk/gummibånd) */
  multiSelection: Set<string>;
  /** Kategorikoder (f.eks. "31") som er skjult fra lerretet – kun en visningsfilter, påvirker ikke mengdelisten */
  hiddenCategories: Set<string>;

  /** Angre/gjenta-historikk over tegnedata (lines/symbols/transitions/branches) */
  history: { past: DrawSnapshot[]; future: DrawSnapshot[] };
  /** Sann under en pågående dra-gest, for å samle kontinuerlige oppdateringer til ett angre-steg */
  historyPaused: boolean;

  // Standardlengder for automatiske skjøter (konfigurerbart via innstillingsdialogen)
  standardLengths: { pipe: number; duct: number };
  settingsDialogOpen: boolean;
  /** Skjuler verktøylinje/lerret og lar mengdelisten fylle hele arbeidsflaten */
  focusMode: boolean;
  /** Visningsstil for tegnede rør/kanaler: 3D-sylinder eller enkel strek (med symboler) */
  pipeRenderStyle: PipeRenderStyle;
  /** Fargetema for tegneverktøyet (lys er standard) */
  theme: Theme;
  /** Vis luftrettings-piler på tilluft-/avtrekksventiler */
  showAirflowArrows: boolean;
  /** Skjul tekst-etiketter for komponenter (overganger/avgreininger) på lerretet */
  hideComponentLabels: boolean;
  /** Modus for arealmåling: fri polygon eller rektangel (klikk-og-dra) */
  areaMeasureMode: 'free' | 'rect';
  /** Egendefinerte systemkoder (f.eks. «360.001») som kan velges på rør/kanaler/utstyr */
  customSystems: string[];
  /** Egendefinerte dimensjoner lagt til per underkategori (runde eller rektangulære kanalmål osv.) */
  customDimensions: Record<string, string[]>;
  /** Egendefinerte farger per underkategori (subId → hex), overstyrer standardfargen i katalogen. */
  customColors: Record<string, string>;
  /** Sist brukt stil for nye tekst-/sky-annotasjoner */
  annotationConfig: { text: { color: string; fontSize: number }; cloud: { color: string; strokeWidth: number } };

  // Ventende valg av avgreiningstype for kanaler (påstikk/T-kanal)
  pendingBranchChoice: PendingBranchChoice | null;
  /** Utstyr som er klikket inn et sted uten kanal/rør under – venter på bekreftelse */
  pendingOffLineSymbol: { type: SymbolType; x: number; y: number; systemId?: string } | null;
  /** Om bekreftelsesdialogen for utstyr-uten-kanal er slått av av brukeren */
  suppressOffLineWarning: boolean;

  // Visning (Konva stage-transform)
  view: ViewTransform;
  /** Synlig lerret-størrelse i piksler (satt av PdfCanvas' ResizeObserver), brukt til
   * å sentrere zoom-knappene på midten av det synlige området i stedet for origo. */
  stageSize: { width: number; height: number };

  // Dialog / kalibrering
  scaleDialogOpen: boolean;
  scaleDialogTab: 'auto' | 'manual' | 'calibrate';
  calibrationDistancePx: number | null;

  // Tilpass-til-skjerm-signal (økes for å be canvas refitte)
  fitSignal: number;

  // Actions
  beginLoad: () => void;
  loadDocument: (
    doc: PdfDoc,
    fileName: string,
    numPages: number,
    detected: ScaleState | null,
  ) => void;
  setError: (msg: string) => void;
  setPageImage: (canvas: HTMLCanvasElement, w: number, h: number) => void;
  setPage: (n: number) => void;
  rescanAutoScale: () => Promise<void>;
  /** Setter et gjenopprettet PDF-dokument uten å nullstille mengdedata (brukes ved gjenåpning av tilbud). */
  attachPdfDoc: (doc: PdfDoc, numPages: number) => void;

  setScale: (s: ScaleState) => void;
  openScaleDialog: (tab: 'auto' | 'manual' | 'calibrate') => void;
  closeScaleDialog: () => void;
  setCalibrationDistance: (px: number) => void;

  setTool: (t: ToolMode) => void;
  select: (id: string, kind: Exclude<SelectedKind, null>) => void;
  clearSelection: () => void;

  /** Velger materiale + dimensjon for en underkategori og aktiverer linjeverktøyet */
  setLineSelection: (subId: string, material: string, dimension: string) => void;
  /** Oppdaterer kun dimensjonen for en underkategoris aktive verktøykonfigurasjon (brukes ved bytte midt i tegning) */
  updateLineConfigDimension: (subId: string, dimension: string) => void;

  addLine: (
    subId: string,
    points: number[],
    material?: string,
    dimension?: string,
    systemId?: string,
  ) => void;
  /** Tegner en ferdig (evt. fleir-punkts) polylinje som separate rette 2-punkts
   * rør-/kanalsegmenter (ett per strekk), à la Revit – hvert rett strekk er sin egen
   * enhet som kan velges/måles for seg, mens bend mellom dem lagres som egne
   * BendEntity-markører (brukt i mengdelisten og for visning). `anchor` er det
   * forrige punktet på et rør/kanal man fortsetter fra (extend/continue) – brukes
   * kun til å beregne en ev. bend akkurat i skjøtepunktet, uten å duplisere det
   * gamle segmentet. */
  addLineRun: (
    subId: string,
    points: number[],
    material?: string,
    dimension?: string,
    systemId?: string,
    anchor?: { x: number; y: number },
  ) => void;
  /** Splitter et rett 2-punkts segment i to nye segmenter med et delt punkt
   * (brukt når man klikker midtpunkt-håndtaket for å legge til et knekkpunkt). */
  splitLineAt: (id: string, x: number, y: number) => void;
  updateLinePoints: (id: string, points: number[]) => void;
  updateLineProps: (
    id: string,
    patch: Partial<Pick<LineEntity, 'subId' | 'material' | 'dimension' | 'systemId'>>,
  ) => void;

  addSymbol: (
    type: SymbolType,
    x: number,
    y: number,
    rotation?: number,
    mountedLineId?: string,
    systemId?: string,
  ) => void;
  /** Oppdaterer sist brukte feltverdier for en utstyrstype (dimensjon, lengde osv.),
   * brukt som forhåndsutfylt verdi for nye plasseringer av samme type. */
  setSymbolConfig: (type: SymbolType, patch: Record<string, string | number>) => void;
  updateSymbol: (
    id: string,
    patch: Partial<Pick<SymbolEntity, 'x' | 'y' | 'rotation' | 'systemId'>> & {
      props?: Partial<Record<string, string | number>>;
    },
  ) => void;
  setHoveredSymbol: (id: string | null) => void;
  /** Plasserer utstyr, men ber om bekreftelse først hvis det ikke er montert på et rør/kanal
   * (med mindre brukeren har slått av advarselen). */
  placeSymbolWithGuard: (
    type: SymbolType,
    x: number,
    y: number,
    rotation?: number,
    mountedLineId?: string,
    systemId?: string,
  ) => void;
  confirmPendingOffLineSymbol: (suppressFuture: boolean) => void;
  cancelPendingOffLineSymbol: () => void;
  setShowAirflowArrows: (show: boolean) => void;
  setHideComponentLabels: (hide: boolean) => void;
  setAreaMeasureMode: (mode: 'free' | 'rect') => void;
  addCustomSystem: (code: string) => void;
  removeCustomSystem: (code: string) => void;
  addCustomDimension: (subId: string, dimension: string) => void;
  removeCustomDimension: (subId: string, dimension: string) => void;
  setCustomColor: (subId: string, color: string) => void;
  resetCustomColor: (subId: string) => void;

  addAnnotation: (
    type: AnnotationType,
    x: number,
    y: number,
    extra?: Partial<Pick<AnnotationEntity, 'text' | 'width' | 'height' | 'rotation'>>,
  ) => void;
  updateAnnotation: (id: string, patch: Partial<AnnotationEntity>) => void;
  setAnnotationConfig: (
    type: AnnotationType,
    patch: Partial<{ color: string; fontSize: number; strokeWidth: number }>,
  ) => void;

  addTransition: (
    subId: string,
    material: string,
    fromDimension: string,
    toDimension: string,
    x: number,
    y: number,
  ) => void;

  addBranch: (
    subId: string,
    material: string,
    dimension: string,
    branchDimension: string,
    fittingType: BranchFittingType,
    x: number,
    y: number,
    angleDeg: number,
  ) => void;
  setPendingBranchChoice: (choice: PendingBranchChoice | null) => void;
  resolvePendingBranchChoice: (fittingType: BranchFittingType) => void;
  addTag: (lineId: string, x: number, y: number) => void;
  updateTagLabel: (id: string, labelX: number, labelY: number) => void;
  /** Flytter valgt tag-etikett med (dx,dy) via piltastene. */
  nudgeTag: (id: string, dx: number, dy: number, recordAsNewStep: boolean) => void;
  addMeasurement: (type: MeasurementType, points: number[]) => void;
  /** Flytter valgt(e) linje(r) med (dx,dy) – flytter automatisk med hele den
   * sammenhengende rør-/kanalstrekningen (delte endepunkter), samt tilhørende
   * bend-/overgangs-/avgreiningsmarkører, tagger og montert utstyr, slik at
   * alt fortsatt henger sammen visuelt etter flyttingen. */
  nudgeSelected: (dx: number, dy: number, recordAsNewStep: boolean) => void;
  /** Flytter KUN én linje med (dx,dy). Tilkoblede naboer strekkes (kun det delte
   * endepunktet følger med, den andre enden står stille), og skjøt-markører,
   * monterte symboler og tagger på den flyttede linjen følger med – slik at kun
   * den valgte kanalen flyttes mens resten fortsatt henger sammen. */
  moveSingleLine: (lineId: string, dx: number, dy: number, recordAsNewStep: boolean) => void;

  setStandardLength: (kind: 'pipe' | 'duct', mm: number) => void;
  setPipeRenderStyle: (style: PipeRenderStyle) => void;
  setTheme: (theme: Theme) => void;
  openSettingsDialog: () => void;
  closeSettingsDialog: () => void;
  toggleFocusMode: () => void;

  deleteSelected: () => void;
  clearAll: () => void;

  // Angre/gjenta
  beginHistoryBatch: () => void;
  endHistoryBatch: () => void;
  undo: () => void;
  redo: () => void;

  // Lag/synlighet
  toggleCategoryVisibility: (code: string) => void;

  // Flervalg + bulk-redigering
  setMultiSelection: (ids: string[]) => void;
  toggleMultiSelect: (id: string) => void;
  clearMultiSelection: () => void;
  deleteMany: (ids: string[]) => void;
  updateManyLineProps: (
    ids: string[],
    patch: Partial<Pick<LineEntity, 'subId' | 'material' | 'dimension' | 'systemId'>>,
  ) => void;

  setView: (v: ViewTransform) => void;
  setStageSize: (size: { width: number; height: number }) => void;
  zoomBy: (factor: number) => void;
  requestFit: () => void;

  /** Henter alt som kan lagres som JSON for det aktive tilbudet (ikke PDF-bytes/canvas). */
  exportSnapshot: () => TilbudSnapshot;
  /** Gjenoppretter mengdedata for et tilbud (eller tømmer alt hvis null). */
  importSnapshot: (snapshot: TilbudSnapshot | null) => void;
  /** Nullstiller hele arbeidsflaten (brukes når man bytter til et annet tilbud). */
  resetWorkspace: () => void;
}

export interface TilbudSnapshot {
  lines: LineEntity[];
  symbols: SymbolEntity[];
  transitions: TransitionEntity[];
  branches: BranchEntity[];
  bends: BendEntity[];
  annotations: AnnotationEntity[];
  tags: TagEntity[];
  measurements: MeasurementEntity[];
  scale: ScaleState;
  lineConfig: Record<string, { material: string; dimension: string }>;
  symbolConfig: Record<string, Record<string, string | number>>;
  fileName: string | null;
  numPages: number;
  currentPage: number;
}

const initialScale: ScaleState = { metersPerPixel: null, label: 'Ikke satt', source: 'none' };
const initialSettings = loadSettings();

export const useStore = create<AppState>((set, get) => {
  /** Lagrer nåværende tegnedata på angre-stacken, med mindre vi er midt i en
   * dra-gest som bevisst samles til ett steg (se beginHistoryBatch/endHistoryBatch). */
  function recordHistory() {
    const s = get();
    if (s.historyPaused) return;
    const snapshot: DrawSnapshot = {
      lines: s.lines,
      symbols: s.symbols,
      transitions: s.transitions,
      branches: s.branches,
      bends: s.bends,
      annotations: s.annotations,
      tags: s.tags,
      measurements: s.measurements,
    };
    set((st) => ({
      history: { past: [...st.history.past.slice(-(MAX_HISTORY - 1)), snapshot], future: [] },
    }));
  }

  return {
  pdfDoc: null,
  fileName: null,
  numPages: 0,
  currentPage: 1,
  pageImage: null,
  pageWidth: 0,
  pageHeight: 0,
  isLoading: false,
  error: null,

  scale: initialScale,
  autoDetected: null,
  isScanning: false,

  lines: [],
  symbols: [],
  transitions: [],
  branches: [],
  bends: [],
  annotations: [],
  tags: [],
  measurements: [],

  tool: 'select',
  selectedId: null,
  selectedKind: null,
  lineConfig: {},
  symbolConfig: {},
  hoveredSymbolId: null,
  multiSelection: new Set<string>(),
  hiddenCategories: new Set<string>(),

  history: { past: [], future: [] },
  historyPaused: false,

  standardLengths: { pipe: initialSettings.pipe, duct: initialSettings.duct },
  settingsDialogOpen: false,
  focusMode: false,
  pipeRenderStyle: initialSettings.pipeRenderStyle,
  theme: initialSettings.theme,
  showAirflowArrows: initialSettings.showAirflowArrows,
  hideComponentLabels: initialSettings.hideComponentLabels,
  areaMeasureMode: 'free',
  customSystems: initialSettings.customSystems,
  customDimensions: initialSettings.customDimensions,
  customColors: initialSettings.customColors,
  annotationConfig: {
    text: { color: '#1a1a1a', fontSize: 14 },
    cloud: { color: '#e74c3c', strokeWidth: 2 },
  },

  pendingBranchChoice: null,
  pendingOffLineSymbol: null,
  suppressOffLineWarning: initialSettings.suppressOffLineWarning,

  view: { scale: 1, x: 0, y: 0 },
  stageSize: { width: 800, height: 600 },

  scaleDialogOpen: false,
  scaleDialogTab: 'manual',
  calibrationDistancePx: null,

  fitSignal: 0,

  beginLoad: () => set({ isLoading: true, error: null }),

  attachPdfDoc: (doc, numPages) =>
    set((s) => ({
      pdfDoc: doc,
      numPages,
      isLoading: false,
      error: null,
      currentPage: Math.min(Math.max(1, s.currentPage), numPages || 1),
    })),

  loadDocument: (doc, fileName, numPages, detected) =>
    set({
      pdfDoc: doc,
      fileName,
      numPages,
      currentPage: 1,
      isLoading: false,
      error: null,
      lines: [],
      symbols: [],
      transitions: [],
      branches: [],
      bends: [],
      selectedId: null,
      selectedKind: null,
      multiSelection: new Set<string>(),
      history: { past: [], future: [] },
      scale: detected ?? initialScale,
      autoDetected: detected,
    }),

  setError: (msg) => set({ isLoading: false, error: msg }),

  setPageImage: (canvas, w, h) => set({ pageImage: canvas, pageWidth: w, pageHeight: h }),

  rescanAutoScale: async () => {
    const { pdfDoc } = get();
    if (!pdfDoc) return;
    set({ isScanning: true });
    try {
      const detected = await detectScaleFromPdf(pdfDoc);
      set({ autoDetected: detected, isScanning: false });
    } catch {
      set({ isScanning: false });
    }
  },

  setPage: (n) => {
    const { numPages } = get();
    const page = Math.min(Math.max(1, n), numPages || 1);
    set({ currentPage: page, selectedId: null, selectedKind: null });
  },

  setScale: (s) => set({ scale: s }),
  openScaleDialog: (tab) => set({ scaleDialogOpen: true, scaleDialogTab: tab }),
  closeScaleDialog: () =>
    set({ scaleDialogOpen: false, calibrationDistancePx: null, tool: 'select' }),
  setCalibrationDistance: (px) =>
    set({ calibrationDistancePx: px, scaleDialogOpen: true, scaleDialogTab: 'calibrate' }),

  setTool: (t) => set({ tool: t, selectedId: null, selectedKind: null }),
  select: (id, kind) => set({ selectedId: id, selectedKind: kind }),
  clearSelection: () => set({ selectedId: null, selectedKind: null }),

  setLineSelection: (subId, material, dimension) =>
    set((s) => ({
      lineConfig: { ...s.lineConfig, [subId]: { material, dimension } },
      tool: `line:${subId}`,
      selectedId: null,
      selectedKind: null,
    })),

  updateLineConfigDimension: (subId, dimension) =>
    set((s) => {
      const sub = SUBCATEGORIES[subId];
      const material = s.lineConfig[subId]?.material ?? sub.materials[0];
      return { lineConfig: { ...s.lineConfig, [subId]: { material, dimension } } };
    }),

  addLine: (subId, points, material, dimension, systemId) => {
    recordHistory();
    const sub = SUBCATEGORIES[subId];
    const cfg = get().lineConfig[subId];
    const line: LineEntity = {
      id: nextId('line'),
      page: get().currentPage,
      subId,
      material: material ?? cfg?.material ?? sub.materials[0],
      dimension: dimension ?? cfg?.dimension ?? sub.dimensions[0],
      points,
      systemId,
    };
    set((s) => ({ lines: [...s.lines, line], selectedId: line.id, selectedKind: 'line' }));
  },

  addLineRun: (subId, points, material, dimension, systemId, anchor) => {
    if (points.length < 4) return;
    recordHistory();
    const sub = SUBCATEGORIES[subId];
    const cfg = get().lineConfig[subId];
    const finalMaterial = material ?? cfg?.material ?? sub.materials[0];
    const finalDimension = dimension ?? cfg?.dimension ?? sub.dimensions[0];
    const page = get().currentPage;

    const newLines: LineEntity[] = [];
    for (let i = 0; i + 3 < points.length; i += 2) {
      newLines.push({
        id: nextId('line'),
        page,
        subId,
        material: finalMaterial,
        dimension: finalDimension,
        points: [points[i], points[i + 1], points[i + 2], points[i + 3]],
        systemId,
      });
    }
    // `anchor` (forrige punkt på røret man fortsetter fra) tas kun med i selve
    // bend-beregningen – ikke i newLines over – slik at skjøtepunktet også kan få
    // en bend-markør uten at det gamle segmentet dupliseres som en ny linje.
    const bendSourcePoints = anchor ? [anchor.x, anchor.y, ...points] : points;
    const newBends: BendEntity[] = polylineBendAngles(bendSourcePoints).map((b) => ({
      id: nextId('bend'),
      page,
      subId,
      material: finalMaterial,
      dimension: finalDimension,
      x: b.x,
      y: b.y,
      angleDeg: classifyBendAngle(b.angleDeg),
    }));
    const lastLine = newLines[newLines.length - 1];
    set((s) => ({
      lines: [...s.lines, ...newLines],
      bends: [...s.bends, ...newBends],
      selectedId: lastLine?.id ?? null,
      selectedKind: lastLine ? 'line' : null,
    }));
  },

  splitLineAt: (id, x, y) => {
    const line = get().lines.find((l) => l.id === id);
    if (!line) return;
    recordHistory();
    const [x0, y0, x1, y1] = line.points;
    const a: LineEntity = { ...line, id: nextId('line'), points: [x0, y0, x, y] };
    const b: LineEntity = { ...line, id: nextId('line'), points: [x, y, x1, y1] };
    set((s) => ({
      lines: [...s.lines.filter((l) => l.id !== id), a, b],
      selectedId: null,
      selectedKind: null,
    }));
  },

  updateLinePoints: (id, points) => {
    recordHistory();
    set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, points } : l)) }));
  },

  updateLineProps: (id, patch) => {
    recordHistory();
    set((s) => ({
      lines: s.lines.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        // bytter man underkategori, sørg for gyldig materiale/dimensjon
        if (patch.subId) {
          const sub = SUBCATEGORIES[patch.subId];
          if (!sub.materials.includes(next.material)) next.material = sub.materials[0];
          if (!sub.dimensions.includes(next.dimension)) next.dimension = sub.dimensions[0];
        }
        return next;
      }),
    }));
  },

  addSymbol: (type, x, y, rotation = 0, mountedLineId, systemId) => {
    recordHistory();
    const sym: SymbolEntity = {
      id: nextId('sym'),
      page: get().currentPage,
      type,
      x,
      y,
      rotation,
      props: { ...defaultSymbolProps(type), ...get().symbolConfig[type] },
      mountedLineId,
      systemId,
    };
    set((s) => ({ symbols: [...s.symbols, sym], selectedId: sym.id, selectedKind: 'symbol' }));
  },

  setSymbolConfig: (type, patch) =>
    set((s) => ({
      symbolConfig: { ...s.symbolConfig, [type]: { ...s.symbolConfig[type], ...patch } },
    })),

  placeSymbolWithGuard: (type, x, y, rotation = 0, mountedLineId, systemId) => {
    if (mountedLineId || get().suppressOffLineWarning) {
      get().addSymbol(type, x, y, rotation, mountedLineId, systemId);
      return;
    }
    set({ pendingOffLineSymbol: { type, x, y, systemId } });
  },

  confirmPendingOffLineSymbol: (suppressFuture) => {
    const pending = get().pendingOffLineSymbol;
    if (!pending) return;
    get().addSymbol(pending.type, pending.x, pending.y, 0, undefined, pending.systemId);
    set({ pendingOffLineSymbol: null });
    if (suppressFuture) {
      set((s) => {
        persistSettings(s, { suppressOffLineWarning: true });
        return { suppressOffLineWarning: true };
      });
    }
  },

  cancelPendingOffLineSymbol: () => set({ pendingOffLineSymbol: null }),

  setShowAirflowArrows: (show) =>
    set((s) => {
      persistSettings(s, { showAirflowArrows: show });
      return { showAirflowArrows: show };
    }),

  setHideComponentLabels: (hide) =>
    set((s) => {
      persistSettings(s, { hideComponentLabels: hide });
      return { hideComponentLabels: hide };
    }),

  setAreaMeasureMode: (mode) => set({ areaMeasureMode: mode }),

  addCustomSystem: (code) =>
    set((s) => {
      const trimmed = code.trim();
      if (!trimmed || s.customSystems.includes(trimmed)) return s;
      const next = [...s.customSystems, trimmed];
      persistSettings(s, { customSystems: next });
      return { customSystems: next };
    }),

  removeCustomSystem: (code) =>
    set((s) => {
      const next = s.customSystems.filter((c) => c !== code);
      persistSettings(s, { customSystems: next });
      return { customSystems: next };
    }),

  addCustomDimension: (subId, dimension) =>
    set((s) => {
      const trimmed = dimension.trim();
      const existing = s.customDimensions[subId] ?? [];
      if (!trimmed || existing.includes(trimmed) || SUBCATEGORIES[subId]?.dimensions.includes(trimmed)) return s;
      const next = { ...s.customDimensions, [subId]: [...existing, trimmed] };
      persistSettings(s, { customDimensions: next });
      return { customDimensions: next };
    }),

  removeCustomDimension: (subId, dimension) =>
    set((s) => {
      const existing = s.customDimensions[subId] ?? [];
      const next = { ...s.customDimensions, [subId]: existing.filter((d) => d !== dimension) };
      persistSettings(s, { customDimensions: next });
      return { customDimensions: next };
    }),

  setCustomColor: (subId, color) =>
    set((s) => {
      const next = { ...s.customColors, [subId]: color };
      persistSettings(s, { customColors: next });
      return { customColors: next };
    }),

  resetCustomColor: (subId) =>
    set((s) => {
      const next = { ...s.customColors };
      delete next[subId];
      persistSettings(s, { customColors: next });
      return { customColors: next };
    }),

  addAnnotation: (type, x, y, extra) => {
    recordHistory();
    const cfg = get().annotationConfig[type];
    const note: AnnotationEntity = {
      id: nextId('note'),
      page: get().currentPage,
      type,
      x,
      y,
      rotation: 0,
      color: cfg.color,
      ...(type === 'text'
        ? { text: extra?.text ?? 'Tekst', fontSize: get().annotationConfig.text.fontSize }
        : {
            width: extra?.width ?? 160,
            height: extra?.height ?? 100,
            strokeWidth: get().annotationConfig.cloud.strokeWidth,
          }),
      ...extra,
    };
    set((s) => ({ annotations: [...s.annotations, note], selectedId: note.id, selectedKind: 'annotation' }));
  },

  updateAnnotation: (id, patch) => {
    recordHistory();
    set((s) => ({ annotations: s.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  },

  setAnnotationConfig: (type, patch) =>
    set((s) => ({
      annotationConfig: { ...s.annotationConfig, [type]: { ...s.annotationConfig[type], ...patch } },
    })),

  updateSymbol: (id, patch) => {
    recordHistory();
    set((s) => ({
      symbols: s.symbols.map((sy) => {
        if (sy.id !== id) return sy;
        const { props, ...rest } = patch;
        const nextProps = props ? { ...sy.props, ...props } : sy.props;
        return { ...sy, ...rest, props: nextProps as Record<string, string | number> };
      }),
    }));
  },

  setHoveredSymbol: (id) => set({ hoveredSymbolId: id }),

  addTransition: (subId, material, fromDimension, toDimension, x, y) => {
    recordHistory();
    const transition: TransitionEntity = {
      id: nextId('trans'),
      page: get().currentPage,
      subId,
      material,
      fromDimension,
      toDimension,
      x,
      y,
    };
    set((s) => ({ transitions: [...s.transitions, transition] }));
  },

  addBranch: (subId, material, dimension, branchDimension, fittingType, x, y, angleDeg) => {
    recordHistory();
    const branch: BranchEntity = {
      id: nextId('branch'),
      page: get().currentPage,
      subId,
      material,
      dimension,
      branchDimension,
      fittingType,
      x,
      y,
      angleDeg,
    };
    set((s) => ({ branches: [...s.branches, branch] }));
  },

  addTag: (lineId, x, y) => {
    recordHistory();
    const tag: TagEntity = {
      id: nextId('tag'),
      page: get().currentPage,
      lineId,
      x,
      y,
      // Standard-forskyvning for tag-boksen, slik at den ikke havner rett oppå
      // leaderlinjens ankerpunkt – brukeren kan dra den videre selv.
      labelX: x + 40,
      labelY: y - 40,
    };
    set((s) => ({ tags: [...s.tags, tag], selectedId: tag.id, selectedKind: 'tag' }));
  },

  updateTagLabel: (id, labelX, labelY) => {
    recordHistory();
    set((s) => ({ tags: s.tags.map((t) => (t.id === id ? { ...t, labelX, labelY } : t)) }));
  },

  nudgeTag: (id, dx, dy, recordAsNewStep) => {
    if (recordAsNewStep) recordHistory();
    set((s) => ({
      tags: s.tags.map((t) => (t.id === id ? { ...t, labelX: t.labelX + dx, labelY: t.labelY + dy } : t)),
    }));
  },

  addMeasurement: (type, points) => {
    recordHistory();
    const measurement: MeasurementEntity = {
      id: nextId('measure'),
      page: get().currentPage,
      type,
      points,
    };
    set((s) => ({
      measurements: [...s.measurements, measurement],
      selectedId: measurement.id,
      selectedKind: 'measurement',
    }));
  },

  setPendingBranchChoice: (choice) => set({ pendingBranchChoice: choice }),

  resolvePendingBranchChoice: (fittingType) => {
    const choice = get().pendingBranchChoice;
    if (!choice) return;
    get().addBranch(
      choice.mainSubId,
      choice.mainMaterial,
      choice.mainDimension,
      choice.branchDimension,
      fittingType,
      choice.x,
      choice.y,
      choice.angleDeg,
    );
    set({ pendingBranchChoice: null });
  },

  setStandardLength: (kind, mm) =>
    set((s) => {
      const next = { ...s.standardLengths, [kind]: mm };
      persistSettings(s, { pipe: next.pipe, duct: next.duct });
      return { standardLengths: next };
    }),

  setPipeRenderStyle: (style) =>
    set((s) => {
      persistSettings(s, { pipeRenderStyle: style });
      return { pipeRenderStyle: style };
    }),

  setTheme: (theme) =>
    set((s) => {
      persistSettings(s, { theme });
      return { theme };
    }),
  openSettingsDialog: () => set({ settingsDialogOpen: true }),
  closeSettingsDialog: () => set({ settingsDialogOpen: false }),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),

  deleteSelected: () => {
    const { selectedId, selectedKind } = get();
    if (!selectedId) return;
    recordHistory();
    if (selectedKind === 'line') {
      set((s) => ({ lines: s.lines.filter((l) => l.id !== selectedId) }));
    } else if (selectedKind === 'symbol') {
      set((s) => ({ symbols: s.symbols.filter((sy) => sy.id !== selectedId) }));
    } else if (selectedKind === 'branch') {
      set((s) => ({ branches: s.branches.filter((b) => b.id !== selectedId) }));
    } else if (selectedKind === 'transition') {
      set((s) => ({ transitions: s.transitions.filter((t) => t.id !== selectedId) }));
    } else if (selectedKind === 'bend') {
      set((s) => ({ bends: s.bends.filter((b) => b.id !== selectedId) }));
    } else if (selectedKind === 'annotation') {
      set((s) => ({ annotations: s.annotations.filter((a) => a.id !== selectedId) }));
    } else if (selectedKind === 'tag') {
      set((s) => ({ tags: s.tags.filter((t) => t.id !== selectedId) }));
    } else if (selectedKind === 'measurement') {
      set((s) => ({ measurements: s.measurements.filter((m) => m.id !== selectedId) }));
    }
    set({ selectedId: null, selectedKind: null });
  },

  clearAll: () => {
    recordHistory();
    set({
      lines: [],
      symbols: [],
      transitions: [],
      branches: [],
      bends: [],
      annotations: [],
      tags: [],
      measurements: [],
      selectedId: null,
      selectedKind: null,
    });
  },

  beginHistoryBatch: () => {
    recordHistory();
    set({ historyPaused: true });
  },
  endHistoryBatch: () => set({ historyPaused: false }),

  undo: () => {
    const s = get();
    if (s.history.past.length === 0) return;
    const previous = s.history.past[s.history.past.length - 1];
    const current: DrawSnapshot = {
      lines: s.lines,
      symbols: s.symbols,
      transitions: s.transitions,
      branches: s.branches,
      bends: s.bends,
      annotations: s.annotations,
      tags: s.tags,
      measurements: s.measurements,
    };
    set({
      ...previous,
      history: { past: s.history.past.slice(0, -1), future: [current, ...s.history.future] },
      selectedId: null,
      selectedKind: null,
      multiSelection: new Set<string>(),
    });
  },

  redo: () => {
    const s = get();
    if (s.history.future.length === 0) return;
    const next = s.history.future[0];
    const current: DrawSnapshot = {
      lines: s.lines,
      symbols: s.symbols,
      transitions: s.transitions,
      branches: s.branches,
      bends: s.bends,
      annotations: s.annotations,
      tags: s.tags,
      measurements: s.measurements,
    };
    set({
      ...next,
      history: { past: [...s.history.past, current], future: s.history.future.slice(1) },
      selectedId: null,
      selectedKind: null,
      multiSelection: new Set<string>(),
    });
  },

  toggleCategoryVisibility: (code) =>
    set((s) => {
      const next = new Set(s.hiddenCategories);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return { hiddenCategories: next };
    }),

  setMultiSelection: (ids) => set({ multiSelection: new Set(ids) }),
  toggleMultiSelect: (id) =>
    set((s) => {
      const next = new Set(s.multiSelection);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { multiSelection: next };
    }),
  clearMultiSelection: () => set({ multiSelection: new Set<string>() }),

  deleteMany: (ids) => {
    if (ids.length === 0) return;
    recordHistory();
    const idSet = new Set(ids);
    set((s) => ({
      lines: s.lines.filter((l) => !idSet.has(l.id)),
      symbols: s.symbols.filter((sy) => !idSet.has(sy.id)),
      branches: s.branches.filter((b) => !idSet.has(b.id)),
      transitions: s.transitions.filter((t) => !idSet.has(t.id)),
      bends: s.bends.filter((b) => !idSet.has(b.id)),
      annotations: s.annotations.filter((a) => !idSet.has(a.id)),
      tags: s.tags.filter((t) => !idSet.has(t.id)),
      measurements: s.measurements.filter((m) => !idSet.has(m.id)),
      multiSelection: new Set<string>(),
    }));
  },

  updateManyLineProps: (ids, patch) => {
    if (ids.length === 0) return;
    recordHistory();
    const idSet = new Set(ids);
    set((s) => ({
      lines: s.lines.map((l) => {
        if (!idSet.has(l.id)) return l;
        const next = { ...l, ...patch };
        if (patch.subId) {
          const sub = SUBCATEGORIES[patch.subId];
          if (!sub.materials.includes(next.material)) next.material = sub.materials[0];
          if (!sub.dimensions.includes(next.dimension)) next.dimension = sub.dimensions[0];
        }
        return next;
      }),
    }));
  },

  nudgeSelected: (dx, dy, recordAsNewStep) => {
    const s = get();
    let seedIds: string[] = [];
    if (s.multiSelection.size > 0) {
      seedIds = Array.from(s.multiSelection).filter((id) => s.lines.some((l) => l.id === id));
    } else if (s.selectedKind === 'line' && s.selectedId) {
      seedIds = [s.selectedId];
    }
    if (seedIds.length === 0) return;
    if (recordAsNewStep) recordHistory();

    const pageLines = s.lines.filter((l) => l.page === s.currentPage);
    const movingIds = findConnectedLineIds(pageLines, seedIds);
    // Samle alle punkter (før flytting) på de linjene som flyttes – brukes til å finne
    // hvilke bend/overgang/avgreining-markører som satt akkurat på disse skjøtene, slik
    // at de blir med på flyttingen i stedet for å bli liggende igjen på gammel plass.
    const oldPoints: { x: number; y: number }[] = [];
    for (const l of pageLines) {
      if (!movingIds.has(l.id)) continue;
      for (let i = 0; i + 1 < l.points.length; i += 2) {
        oldPoints.push({ x: l.points[i], y: l.points[i + 1] });
      }
    }
    const nearOld = (x: number, y: number, eps = 0.5) =>
      oldPoints.some((p) => Math.abs(p.x - x) < eps && Math.abs(p.y - y) < eps);

    set((st) => ({
      lines: st.lines.map((l) =>
        movingIds.has(l.id)
          ? { ...l, points: l.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) }
          : l,
      ),
      bends: st.bends.map((b) => (nearOld(b.x, b.y) ? { ...b, x: b.x + dx, y: b.y + dy } : b)),
      transitions: st.transitions.map((t) => (nearOld(t.x, t.y) ? { ...t, x: t.x + dx, y: t.y + dy } : t)),
      branches: st.branches.map((b) => (nearOld(b.x, b.y) ? { ...b, x: b.x + dx, y: b.y + dy } : b)),
      tags: st.tags.map((t) =>
        movingIds.has(t.lineId)
          ? { ...t, x: t.x + dx, y: t.y + dy, labelX: t.labelX + dx, labelY: t.labelY + dy }
          : t,
      ),
      symbols: st.symbols.map((sy) =>
        sy.mountedLineId && movingIds.has(sy.mountedLineId) ? { ...sy, x: sy.x + dx, y: sy.y + dy } : sy,
      ),
    }));
  },

  moveSingleLine: (lineId, dx, dy, recordAsNewStep) => {
    const s = get();
    const line = s.lines.find((l) => l.id === lineId && l.page === s.currentPage);
    if (!line) return;
    if (recordAsNewStep) recordHistory();

    const pageLines = s.lines.filter((l) => l.page === line.page);
    const eps = 0.5;
    const near = (ax: number, ay: number, bx: number, by: number) =>
      Math.abs(ax - bx) < eps && Math.abs(ay - by) < eps;

    // Retningen til linjen som flyttes (ende-til-ende). Etter flytting skal L beholde
    // denne retningen (L-ny-linje = L translatert med (dx,dy)), slik at vinkelen mot
    // naboene ikke endres.
    const n = line.points.length;
    const dirL = { x: line.points[n - 2] - line.points[0], y: line.points[n - 1] - line.points[1] };
    const oldEndpoints = [
      { x: line.points[0], y: line.points[1] },
      { x: line.points[n - 2], y: line.points[n - 1] },
    ];

    // For hvert endepunkt E på L: beregn hvor E havner (newEndpoint), og hvilke
    // nabo-vertekser som skal flyttes dit. Naboer beholder sin egen retning – kun deres
    // delte skjøt følger med – slik at bend-vinklene bevares nøyaktig.
    const newEndpoint = oldEndpoints.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    const neighborMoves: { lineId: string; vertexIndex: number; x: number; y: number }[] = [];

    oldEndpoints.forEach((E, k) => {
      const neighbors: { line: LineEntity; vertexIndex: number }[] = [];
      for (const other of pageLines) {
        if (other.id === lineId) continue;
        const on = other.points.length;
        for (const i of [0, on - 2]) {
          if (near(other.points[i], other.points[i + 1], E.x, E.y)) {
            neighbors.push({ line: other, vertexIndex: i });
          }
        }
      }

      if (neighbors.length === 1) {
        const nb = neighbors[0];
        const nn = nb.line.points.length;
        // Naboens faste fjern-ende (motsatt av skjøten) og dens opprinnelige retning.
        const sharedIsStart = nb.vertexIndex === 0;
        const farX = sharedIsStart ? nb.line.points[nn - 2] : nb.line.points[0];
        const farY = sharedIsStart ? nb.line.points[nn - 1] : nb.line.points[1];
        const dirN = { x: E.x - farX, y: E.y - farY };
        // Nytt skjøtpunkt = skjæring mellom L-ny-linje og naboens faste linje.
        const hit = lineIntersect({ x: E.x + dx, y: E.y + dy }, dirL, { x: farX, y: farY }, dirN);
        const target = hit ?? { x: E.x + dx, y: E.y + dy }; // fallback: parallell/kolineær → strekk
        newEndpoint[k] = target;
        neighborMoves.push({ lineId: nb.line.id, vertexIndex: nb.vertexIndex, x: target.x, y: target.y });
      } else if (neighbors.length >= 2) {
        // T-rør/forgrening: bevar ikke vinkel – flytt skjøten og dra alle naboer dit.
        for (const nb of neighbors) {
          neighborMoves.push({ lineId: nb.line.id, vertexIndex: nb.vertexIndex, x: E.x + dx, y: E.y + dy });
        }
        newEndpoint[k] = { x: E.x + dx, y: E.y + dy };
      }
      // neighbors.length === 0 → fri ende: newEndpoint[k] er allerede E+(dx,dy).
    });

    const movesByLine = new Map<string, { vertexIndex: number; x: number; y: number }[]>();
    for (const m of neighborMoves) {
      const arr = movesByLine.get(m.lineId) ?? [];
      arr.push({ vertexIndex: m.vertexIndex, x: m.x, y: m.y });
      movesByLine.set(m.lineId, arr);
    }

    // Hvor havner et gammelt skjøtpunkt? Brukt for å flytte markører til det NYE
    // skjøtpunktet (ikke bare med (dx,dy)), slik at de blir liggende riktig.
    const remap = (x: number, y: number): { x: number; y: number } | null => {
      for (let k = 0; k < oldEndpoints.length; k++) {
        if (near(oldEndpoints[k].x, oldEndpoints[k].y, x, y)) return newEndpoint[k];
      }
      return null;
    };

    set((st) => ({
      lines: st.lines.map((l) => {
        if (l.id === lineId) {
          // Endepunktene settes til newEndpoint (skjæring eller translatert) – begge ligger
          // på L-ny-linje, så L beholder retningen. Ev. indre punkter translateres.
          const pts = [...l.points];
          pts[0] = newEndpoint[0].x;
          pts[1] = newEndpoint[0].y;
          pts[pts.length - 2] = newEndpoint[1].x;
          pts[pts.length - 1] = newEndpoint[1].y;
          for (let i = 2; i + 1 < pts.length - 2; i += 2) {
            pts[i] += dx;
            pts[i + 1] += dy;
          }
          return { ...l, points: pts };
        }
        const moves = movesByLine.get(l.id);
        if (!moves) return l;
        const pts = [...l.points];
        for (const mv of moves) {
          pts[mv.vertexIndex] = mv.x;
          pts[mv.vertexIndex + 1] = mv.y;
        }
        return { ...l, points: pts };
      }),
      // Skjøt-markører flyttes til det nye skjøtpunktet (vinkel bevart ⇒ angleDeg gyldig).
      bends: st.bends.map((b) => {
        const r = remap(b.x, b.y);
        return r ? { ...b, x: r.x, y: r.y } : b;
      }),
      transitions: st.transitions.map((t) => {
        const r = remap(t.x, t.y);
        return r ? { ...t, x: r.x, y: r.y } : t;
      }),
      branches: st.branches.map((b) => {
        const r = remap(b.x, b.y);
        return r ? { ...b, x: r.x, y: r.y } : b;
      }),
      // Tagger og montert utstyr på den flyttede linjen følger med.
      tags: st.tags.map((t) =>
        t.lineId === lineId ? { ...t, x: t.x + dx, y: t.y + dy, labelX: t.labelX + dx, labelY: t.labelY + dy } : t,
      ),
      symbols: st.symbols.map((sy) =>
        sy.mountedLineId === lineId ? { ...sy, x: sy.x + dx, y: sy.y + dy } : sy,
      ),
    }));
  },

  setView: (v) => set({ view: v }),
  setStageSize: (size) => set({ stageSize: size }),
  zoomBy: (factor) =>
    set((s) => {
      const newScale = clampScale(s.view.scale * factor);
      // Zoom rundt midten av det synlige lerretet (ikke origo), slik at tegningen
      // ikke hopper mot øvre venstre hjørne når man klikker +/- gjentatte ganger.
      const cx = s.stageSize.width / 2;
      const cy = s.stageSize.height / 2;
      const worldX = (cx - s.view.x) / s.view.scale;
      const worldY = (cy - s.view.y) / s.view.scale;
      return {
        view: {
          scale: newScale,
          x: cx - worldX * newScale,
          y: cy - worldY * newScale,
        },
      };
    }),
  requestFit: () => set((s) => ({ fitSignal: s.fitSignal + 1 })),

  exportSnapshot: () => {
    const s = get();
    return {
      lines: s.lines,
      symbols: s.symbols,
      transitions: s.transitions,
      branches: s.branches,
      bends: s.bends,
      annotations: s.annotations,
      tags: s.tags,
      measurements: s.measurements,
      scale: s.scale,
      lineConfig: s.lineConfig,
      symbolConfig: s.symbolConfig,
      fileName: s.fileName,
      numPages: s.numPages,
      currentPage: s.currentPage,
    };
  },

  importSnapshot: (snapshot) => {
    if (!snapshot) {
      set({
        lines: [],
        symbols: [],
        transitions: [],
        branches: [],
        bends: [],
        annotations: [],
        tags: [],
        measurements: [],
        scale: initialScale,
        autoDetected: null,
        lineConfig: {},
        symbolConfig: {},
        fileName: null,
        numPages: 0,
        currentPage: 1,
        multiSelection: new Set<string>(),
        history: { past: [], future: [] },
      });
      return;
    }
    set({
      lines: snapshot.lines,
      symbols: snapshot.symbols,
      transitions: snapshot.transitions,
      branches: snapshot.branches ?? [],
      bends: snapshot.bends ?? [],
      annotations: snapshot.annotations ?? [],
      tags: snapshot.tags ?? [],
      measurements: snapshot.measurements ?? [],
      scale: snapshot.scale,
      lineConfig: snapshot.lineConfig,
      symbolConfig: snapshot.symbolConfig ?? {},
      fileName: snapshot.fileName,
      numPages: snapshot.numPages,
      currentPage: snapshot.currentPage,
      multiSelection: new Set<string>(),
      history: { past: [], future: [] },
    });
  },

  resetWorkspace: () =>
    set({
      pdfDoc: null,
      fileName: null,
      numPages: 0,
      currentPage: 1,
      pageImage: null,
      pageWidth: 0,
      pageHeight: 0,
      isLoading: false,
      error: null,
      scale: initialScale,
      autoDetected: null,
      isScanning: false,
      lines: [],
      symbols: [],
      transitions: [],
      branches: [],
      bends: [],
      annotations: [],
      tags: [],
      measurements: [],
      tool: 'select',
      selectedId: null,
      selectedKind: null,
      lineConfig: {},
      symbolConfig: {},
      hoveredSymbolId: null,
      multiSelection: new Set<string>(),
      hiddenCategories: new Set<string>(),
      history: { past: [], future: [] },
      historyPaused: false,
      pendingBranchChoice: null,
      pendingOffLineSymbol: null,
      view: { scale: 1, x: 0, y: 0 },
      scaleDialogOpen: false,
      scaleDialogTab: 'manual',
      calibrationDistancePx: null,
      settingsDialogOpen: false,
      focusMode: false,
    }),
  };
});

export function clampScale(scale: number): number {
  return Math.min(Math.max(scale, 0.1), 8);
}
