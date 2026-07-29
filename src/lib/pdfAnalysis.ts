// Analyse av hva en PDF faktisk INNEHOLDER – fase 1 av PDF-geometri/romgjenkjenning.
//
// Dette er ren introspeksjon: modulen leser aldri fra og skriver aldri til
// tegne-tilstanden, og den kalles ikke fra opplastings- eller render-stien.
// Den finnes for å svare på ett spørsmål før noe annet bygges: er tegningen
// vektor, raster eller blandet, og kan geometri/tekst i det hele tatt hentes ut?
//
// MERK om pdfjs-importen: `pdf.ts` er ellers den eneste fila som importerer
// pdfjs-dist, fordi den eier worker-oppsettet (GlobalWorkerOptions.workerSrc)
// som en side-effekt ved modullasting. Vi importerer OPS/Util herfra i tillegg,
// men det er trygt: hver funksjon under krever en `PdfDoc`, som kun kan
// eksistere hvis `pdf.ts` allerede har kjørt og satt opp workeren. Vite løser
// begge importene til samme modulinstans.

import { OPS, Util } from 'pdfjs-dist';
import { RENDER_SCALE } from './scale';
import type { PdfDoc } from './pdf';

// ── Tak ─────────────────────────────────────────────────────────────────
//
// Viktig: dette er tak på hvor mye vi TAR VARE PÅ, ikke på hva vi teller.
// Tellerne under er eksakte og uten tak, slik at et rapportert tall aldri er
// en avkortet halvsannhet. Eneste unntak er MAX_OPS, som stopper hele
// gjennomgangen – og da settes `truncated`, som dialogen viser tydelig.

export const MAX_OPS = 400_000;
export const MAX_SAMPLE_SEGMENTS = 200;
export const MAX_TEXT_ITEMS = 500;
export const MAX_IMAGE_ITEMS = 50;

/** Hvor ofte `shouldCancel` sjekkes under gjennomgangen. */
const CANCEL_CHECK_INTERVAL = 20_000;

// ── Klassifiseringsterskler ─────────────────────────────────────────────
//
// Disse er bevisst eksportert og justerbare. En ekte plantegning har tusenvis
// av primitiver (yttervegger alene er hundrevis), mens en vektorside med bare
// ramme + tittelfelt + nordpil ligger på 20–150. 200 ligger i det bredeste
// tilgjengelige gapet mellom «bare ramme» og «faktisk plantegning».
//
// Terskelen er likevel et førstegjetning. Derfor eksponerer analysen ALLE rå
// tall, slik at den kan justeres mot faktiske tegninger i stedet for magefølelse.

export const LINEWORK_FLOOR = 200;
export const DECOR_FLOOR = 20;
export const FULLPAGE_COVERAGE = 0.6;

// ── Typer ───────────────────────────────────────────────────────────────

/** `'empty'` er med i tillegg til vector/raster/mixed fordi en forside eller
 *  blank side ellers ville blitt rapportert som `'raster'` og forgiftet
 *  dokument-aggregatet. */
export type PdfContentType = 'vector' | 'raster' | 'mixed' | 'empty';

export interface SampledSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Strekbredde i bilde-piksler (CTM-skalert). */
  lineWidth: number;
  kind: 'line' | 'rect' | 'close';
}

export interface PdfPathStats {
  constructPathOps: number;
  subpaths: number;
  /** Rette segmenter totalt = linje + rektangelkant + lukking. */
  segments: number;
  lineSegments: number;
  rectangles: number;
  rectEdgeSegments: number;
  closeSegments: number;
  /** Bézier-sub-ops. TELLES i fase 1 – flates IKKE ut. */
  curves: number;
  axisAlignedSegments: number;
  totalStraightLengthPx: number;
  strokedPaths: number;
  filledPaths: number;
  /** Klippebaner – ekskludert fra linjeverk-vurderingen, se walkeren. */
  clipPaths: number;
  unpaintedPaths: number;
}

export interface PdfImageItem {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'xobject' | 'inline' | 'mask';
}

export interface PdfImageStats {
  count: number;
  /** 1-bits bildemasker – slik skannede sort/hvitt-tegninger tegnes. */
  maskCount: number;
  inlineCount: number;
  /** Største enkeltbilde som andel av sidearealet, 0–1. */
  largestCoverage: number;
  totalCoverage: number;
  items: PdfImageItem[];
}

export interface TextSourceItem {
  text: string;
  /** Baseline-origo i bilde-pikselrom (samme rom som tegnede entiteter). */
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
  fontSizePx: number;
  rotationDeg: number;
  fontName: string;
  hasEOL: boolean;
  /** 1 for innebygd PDF-tekst. En framtidig OCR-kilde vil ligge under 1. */
  confidence: number;
}

export interface LineworkBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PdfPageAnalysis {
  pageNumber: number;
  rotation: number;
  widthPt: number;
  heightPt: number;
  /** Samme piksler som `renderPage` produserer (viewport ved RENDER_SCALE). */
  widthPx: number;
  heightPx: number;
  renderScale: number;
  contentType: PdfContentType;
  /** Norsk forklaring på hvilken regel som slo til, og med hvilke tall. */
  classificationReason: string;
  operatorCount: number;
  truncated: boolean;
  paths: PdfPathStats;
  images: PdfImageStats;
  text: {
    sourceId: TextSourceId;
    itemCount: number;
    charCount: number;
    items: TextSourceItem[];
  };
  linework: {
    bbox: LineworkBBox | null;
    /** bbox-areal som andel av sidearealet, 0–1. */
    coverage: number;
    sample: SampledSegment[];
  };
  maxFormDepth: number;
  /** Indikator for optional content groups (lag). Se kjente begrensninger. */
  markedContentSections: number;
  durationMs: number;
  warnings: string[];
}

export interface PdfDocAnalysis {
  fileName: string | null;
  numPages: number;
  pdfVersion: string | null;
  producer: string | null;
  creator: string | null;
  /** Kun sider som faktisk er analysert, i sidenummer-orden. */
  pages: PdfPageAnalysis[];
  contentType: PdfContentType;
  durationMs: number;
}

export interface AnalyzeOptions {
  /** Sjekkes periodisk; returnerer true for å avbryte tidlig. */
  shouldCancel?: () => boolean;
}

// ── Tekstkilde-abstraksjon ──────────────────────────────────────────────
//
// Fase 1 har kun én kilde: innebygd PDF-tekst. Grensesnittet finnes for at en
// OCR-kilde skal kunne registrere seg SENERE uten at noe her må skrives om –
// og uten å dra inn en tung WASM-avhengighet nå.

export type TextSourceId = 'embedded' | 'ocr';

export interface PdfTextSource {
  readonly id: TextSourceId;
  readonly label: string;
  isAvailable(doc: PdfDoc, pageNumber: number): Promise<boolean>;
  extract(doc: PdfDoc, pageNumber: number, renderScale: number): Promise<TextSourceItem[]>;
}

export const embeddedTextSource: PdfTextSource = {
  id: 'embedded',
  label: 'Innebygd PDF-tekst',

  async isAvailable(doc, pageNumber) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    return content.items.some((it) => 'str' in it && it.str.trim().length > 0);
  },

  async extract(doc, pageNumber, renderScale) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: renderScale });
    const content = await page.getTextContent();
    const out: TextSourceItem[] = [];

    for (const it of content.items) {
      // TextMarkedContent-elementer har ingen `str` – samme vakt som i
      // detectScaleFromPdf (pdf.ts).
      if (!('str' in it)) continue;
      if (it.str.length === 0) continue;

      // Standard-idiomet fra pdf.js sitt eget tekstlag: komponer sidens
      // viewport-matrise med tekstelementets egen matrise, så havner
      // resultatet i nøyaktig samme pikselrom som den rendrede siden.
      const m = Util.transform(viewport.transform, it.transform);

      out.push({
        text: it.str,
        x: m[4],
        y: m[5],
        widthPx: it.width * renderScale,
        heightPx: it.height * renderScale,
        fontSizePx: Math.hypot(m[2], m[3]),
        rotationDeg: (Math.atan2(m[1], m[0]) * 180) / Math.PI,
        fontName: it.fontName ?? '',
        hasEOL: it.hasEOL ?? false,
        confidence: 1,
      });
    }
    return out;
  },
};

const textSources: PdfTextSource[] = [embeddedTextSource];

/** Registrerer en tilleggskilde (f.eks. OCR) sist i prioritetsrekkefølgen. */
export function registerTextSource(src: PdfTextSource): void {
  if (textSources.some((s) => s.id === src.id)) return;
  textSources.push(src);
}

export function getTextSources(): readonly PdfTextSource[] {
  return textSources;
}

/** Bruker første tilgjengelige tekstkilde. I dag alltid innebygd PDF-tekst. */
export async function extractText(
  doc: PdfDoc,
  pageNumber: number,
  renderScale: number = RENDER_SCALE,
): Promise<{ sourceId: TextSourceId; items: TextSourceItem[] }> {
  for (const src of textSources) {
    if (await src.isAvailable(doc, pageNumber)) {
      return { sourceId: src.id, items: await src.extract(doc, pageNumber, renderScale) };
    }
  }
  return { sourceId: 'embedded', items: [] };
}

// ── Matrisehjelpere ─────────────────────────────────────────────────────

type Matrix = number[];

function applyPoint(m: Matrix, x: number, y: number): [number, number] {
  const p = Util.applyTransform([x, y], m);
  return [p[0], p[1]];
}

/** Uniform skalafaktor for CTM-en – brukes til å gjøre strekbredde til piksler. */
function scaleOf(m: Matrix): number {
  return Math.hypot(m[0], m[1]) || 1;
}

// ── Intern tilstand under gjennomgangen ─────────────────────────────────

interface PendingPath {
  isClip: boolean;
  segments: SampledSegment[];
  subpaths: number;
  rectangles: number;
  curves: number;
}

function emptyPathStats(): PdfPathStats {
  return {
    constructPathOps: 0,
    subpaths: 0,
    segments: 0,
    lineSegments: 0,
    rectangles: 0,
    rectEdgeSegments: 0,
    closeSegments: 0,
    curves: 0,
    axisAlignedSegments: 0,
    totalStraightLengthPx: 0,
    strokedPaths: 0,
    filledPaths: 0,
    clipPaths: 0,
    unpaintedPaths: 0,
  };
}

// ── Hovedanalyse av én side ─────────────────────────────────────────────

/**
 * Går gjennom sidens operatorliste og teller/samler hva den faktisk inneholder.
 *
 * Koordinatkontrakt: CTM-en seedes med `viewport.transform` ved RENDER_SCALE,
 * altså nøyaktig samme viewport som `renderPage` bruker. Uttrukket geometri
 * lander dermed rett i det pikselrommet appen allerede lagrer alle tegnede
 * entiteter i – ingen ny koordinatakse, og `metersPerPixelFromScale` gjelder
 * uendret.
 */
export async function analyzePage(
  doc: PdfDoc,
  pageNumber: number,
  opts: AnalyzeOptions = {},
): Promise<PdfPageAnalysis> {
  const started = performance.now();
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const widthPx = Math.floor(viewport.width);
  const heightPx = Math.floor(viewport.height);
  const pageArea = widthPx * heightPx;
  const warnings: string[] = [];

  const opList = await page.getOperatorList();
  const { fnArray, argsArray } = opList;

  const paths = emptyPathStats();
  const images: PdfImageStats = {
    count: 0,
    maskCount: 0,
    inlineCount: 0,
    largestCoverage: 0,
    totalCoverage: 0,
    items: [],
  };
  const sample: SampledSegment[] = [];
  let bbox: LineworkBBox | null = null;

  let ctm: Matrix = viewport.transform.slice();
  const stack: Matrix[] = [];
  let lineWidth = 1;
  let formDepth = 0;
  let maxFormDepth = 0;
  let markedContentSections = 0;
  let truncated = false;
  let pending: PendingPath | null = null;
  let sawGroupedImageOps = false;

  const limit = Math.min(fnArray.length, MAX_OPS);
  if (fnArray.length > MAX_OPS) truncated = true;

  /** Legger et ferdig transformert segment inn i tellere, bbox og prøve. */
  function emit(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    kind: SampledSegment['kind'],
    target: PendingPath,
  ) {
    const [dx1, dy1] = applyPoint(ctm, x1, y1);
    const [dx2, dy2] = applyPoint(ctm, x2, y2);
    target.segments.push({
      x1: dx1,
      y1: dy1,
      x2: dx2,
      y2: dy2,
      lineWidth: lineWidth * scaleOf(ctm),
      kind,
    });
  }

  /** Avslutter gjeldende bane: teller den, eller forkaster den om den klipper. */
  function commit(pathKind: 'stroke' | 'fill' | 'both' | 'clip' | 'none') {
    if (!pending) return;
    const p = pending;
    pending = null;

    if (pathKind === 'clip' || p.isClip) {
      // Klippebaner ekskluderes bevisst fra linjeverket. Alle arkitekt-PDF-er
      // klipper viewporten med et sidestort rektangel; teller man det som
      // geometri, ser selv en blank side ut til å ha linjeverk, og
      // linjeverk-bboxen blir alltid hele siden.
      paths.clipPaths++;
      return;
    }

    if (pathKind === 'stroke') paths.strokedPaths++;
    else if (pathKind === 'fill') paths.filledPaths++;
    else if (pathKind === 'both') {
      paths.strokedPaths++;
      paths.filledPaths++;
    } else paths.unpaintedPaths++;

    paths.subpaths += p.subpaths;
    paths.rectangles += p.rectangles;
    paths.curves += p.curves;

    for (const s of p.segments) {
      paths.segments++;
      if (s.kind === 'line') paths.lineSegments++;
      else if (s.kind === 'rect') paths.rectEdgeSegments++;
      else paths.closeSegments++;

      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      if (Math.abs(dx) < 0.01 || Math.abs(dy) < 0.01) paths.axisAlignedSegments++;
      paths.totalStraightLengthPx += Math.hypot(dx, dy);

      const minX = Math.min(s.x1, s.x2);
      const maxX = Math.max(s.x1, s.x2);
      const minY = Math.min(s.y1, s.y2);
      const maxY = Math.max(s.y1, s.y2);
      if (!bbox) bbox = { minX, minY, maxX, maxY };
      else {
        if (minX < bbox.minX) bbox.minX = minX;
        if (minY < bbox.minY) bbox.minY = minY;
        if (maxX > bbox.maxX) bbox.maxX = maxX;
        if (maxY > bbox.maxY) bbox.maxY = maxY;
      }

      if (sample.length < MAX_SAMPLE_SEGMENTS) sample.push(s);
    }
  }

  /** Bilder plasseres ved å avbilde enhetskvadratet gjennom CTM-en. */
  function recordImage(kind: PdfImageItem['kind']) {
    images.count++;
    if (kind === 'mask') images.maskCount++;
    if (kind === 'inline') images.inlineCount++;

    const corners: [number, number][] = [
      applyPoint(ctm, 0, 0),
      applyPoint(ctm, 1, 0),
      applyPoint(ctm, 1, 1),
      applyPoint(ctm, 0, 1),
    ];
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const w = Math.max(...xs) - x;
    const h = Math.max(...ys) - y;

    if (images.items.length < MAX_IMAGE_ITEMS) {
      images.items.push({ x, y, width: w, height: h, kind });
    }
    const coverage = pageArea > 0 ? (w * h) / pageArea : 0;
    if (coverage > images.largestCoverage) images.largestCoverage = coverage;
    images.totalCoverage = Math.min(1, images.totalCoverage + coverage);
  }

  for (let i = 0; i < limit; i++) {
    if (i % CANCEL_CHECK_INTERVAL === 0 && opts.shouldCancel?.()) {
      truncated = true;
      break;
    }

    const fn = fnArray[i];
    const args = argsArray[i];

    switch (fn) {
      case OPS.save:
        stack.push(ctm.slice());
        break;

      case OPS.restore:
        // Må aldri underflowe – en defekt PDF kan ha ubalansert q/Q.
        ctm = stack.pop() ?? ctm;
        break;

      case OPS.transform:
        ctm = Util.transform(ctm, args as Matrix);
        break;

      case OPS.setLineWidth:
        lineWidth = args[0] as number;
        break;

      case OPS.paintFormXObjectBegin:
        // pdf.js gjør her implisitt save() + transform(matrise). Speiles vi
        // ikke det, drifter ALT inne i form-XObjectet – og CAD-linjeverk
        // ligger nesten alltid nettopp der.
        stack.push(ctm.slice());
        if (args?.[0]) ctm = Util.transform(ctm, args[0] as Matrix);
        formDepth++;
        if (formDepth > maxFormDepth) maxFormDepth = formDepth;
        break;

      case OPS.paintFormXObjectEnd:
        ctm = stack.pop() ?? ctm;
        if (formDepth > 0) formDepth--;
        break;

      case OPS.constructPath: {
        commit('none'); // en uavsluttet forrige bane
        paths.constructPathOps++;
        pending = { isClip: false, segments: [], subpaths: 0, rectangles: 0, curves: 0 };
        walkSubPath(args as [number[], number[], number[]], pending);
        break;
      }

      case OPS.stroke:
      case OPS.closeStroke:
        commit('stroke');
        break;

      case OPS.fill:
      case OPS.eoFill:
        commit('fill');
        break;

      case OPS.fillStroke:
      case OPS.eoFillStroke:
      case OPS.closeFillStroke:
      case OPS.closeEOFillStroke:
        commit('both');
        break;

      case OPS.clip:
      case OPS.eoClip:
        // pdf.js sender «W n» som clip etterfulgt av endPath – merk banen,
        // men ikke avslutt den her.
        if (pending) pending.isClip = true;
        break;

      case OPS.endPath:
        commit(pending?.isClip ? 'clip' : 'none');
        break;

      case OPS.paintImageXObject:
        recordImage('xobject');
        break;

      case OPS.paintInlineImageXObject:
        recordImage('inline');
        break;

      case OPS.paintImageMaskXObject:
        recordImage('mask');
        break;

      // Grupperte/repeterte bildevarianter: argumentformen er en samling, så
      // vi teller dem, men gjetter ikke på bbox.
      case OPS.paintImageMaskXObjectGroup:
      case OPS.paintInlineImageXObjectGroup:
      case OPS.paintImageXObjectRepeat:
      case OPS.paintImageMaskXObjectRepeat:
      case OPS.paintSolidColorImageMask:
        images.count++;
        sawGroupedImageOps = true;
        break;

      case OPS.beginMarkedContentProps:
        markedContentSections++;
        break;

      default:
        break;
    }
  }

  commit(pending?.isClip ? 'clip' : 'none');

  /**
   * Dekoder én constructPath. `raw` er `[ops, args, minMax]` der `args` er en
   * FLAT tallrekke som leses med en løpende markør – operandantallet per
   * sub-op avgjør hvor mange tall som konsumeres.
   */
  function walkSubPath(raw: [number[], number[], number[]], target: PendingPath) {
    const ops = raw[0] ?? [];
    const a = raw[1] ?? [];
    let j = 0;
    let x = 0;
    let y = 0;
    let startX = 0;
    let startY = 0;
    let hasCurrent = false;

    for (let k = 0; k < ops.length; k++) {
      switch (ops[k] | 0) {
        case OPS.rectangle: {
          const rx = a[j++];
          const ry = a[j++];
          const rw = a[j++];
          const rh = a[j++];
          const xw = rx + rw;
          const yh = ry + rh;
          target.subpaths++;
          target.rectangles++;
          if (rw === 0 || rh === 0) {
            // pdf.js sin degenererte gren: ett strek fra hjørne til hjørne.
            emit(rx, ry, xw, yh, 'rect', target);
          } else {
            emit(rx, ry, xw, ry, 'rect', target);
            emit(xw, ry, xw, yh, 'rect', target);
            emit(xw, yh, rx, yh, 'rect', target);
            emit(rx, yh, rx, ry, 'rect', target);
          }
          // Gjeldende punkt etter et rektangel er rektangelets ORIGO, ikke et
          // hjørne – slik pdf.js selv gjør det. Feil her korrumperer stille
          // enhver lineTo som følger etter en `re`.
          x = rx;
          y = ry;
          startX = rx;
          startY = ry;
          hasCurrent = true;
          break;
        }

        case OPS.moveTo:
          x = a[j++];
          y = a[j++];
          startX = x;
          startY = y;
          hasCurrent = true;
          target.subpaths++;
          break;

        case OPS.lineTo: {
          const nx = a[j++];
          const ny = a[j++];
          if (!hasCurrent) {
            // Defensivt: lineTo uten forutgående moveTo.
            startX = nx;
            startY = ny;
            hasCurrent = true;
            target.subpaths++;
          } else {
            emit(x, y, nx, ny, 'line', target);
          }
          x = nx;
          y = ny;
          break;
        }

        // Kurver TELLES i fase 1 – ingen utflating. Det eneste som MÅ være
        // riktig er at gjeldende punkt flyttes til kurvens endepunkt, ellers
        // får hvert rette segment etter kurven feil koordinater.
        case OPS.curveTo:
          target.curves++;
          x = a[j + 4];
          y = a[j + 5];
          j += 6;
          hasCurrent = true;
          break;

        case OPS.curveTo2:
          target.curves++;
          x = a[j + 2];
          y = a[j + 3];
          j += 4;
          hasCurrent = true;
          break;

        case OPS.curveTo3:
          target.curves++;
          x = a[j + 2];
          y = a[j + 3];
          j += 4;
          hasCurrent = true;
          break;

        case OPS.closePath:
          if (hasCurrent && (x !== startX || y !== startY)) {
            emit(x, y, startX, startY, 'close', target);
          }
          x = startX;
          y = startY;
          break;

        default:
          break;
      }
    }
  }

  if (truncated) {
    warnings.push(
      `Analysen stoppet etter ${limit.toLocaleString('nb-NO')} operatorer – tallene er ufullstendige.`,
    );
  }
  if (sawGroupedImageOps) {
    warnings.push(
      'Siden bruker grupperte/repeterte bilde-operatorer. De er talt, men bidrar ikke til dekningsgrad.',
    );
  }
  if (markedContentSections > 0) {
    warnings.push(
      `Siden har ${markedContentSections} marked content-seksjoner (mulige lag/OCG). Skjulte lag telles med i fase 1.`,
    );
  }

  const text = await extractText(doc, pageNumber, RENDER_SCALE);
  const charCount = text.items.reduce((n, t) => n + t.text.length, 0);

  const { contentType, reason } = classifyPage(paths, images, text.items.length);

  const bboxArea = bbox
    ? Math.max(0, (bbox as LineworkBBox).maxX - (bbox as LineworkBBox).minX) *
      Math.max(0, (bbox as LineworkBBox).maxY - (bbox as LineworkBBox).minY)
    : 0;

  return {
    pageNumber,
    rotation: page.rotate ?? 0,
    widthPt: viewport.width / RENDER_SCALE,
    heightPt: viewport.height / RENDER_SCALE,
    widthPx,
    heightPx,
    renderScale: RENDER_SCALE,
    contentType,
    classificationReason: reason,
    operatorCount: fnArray.length,
    truncated,
    paths,
    images,
    text: {
      sourceId: text.sourceId,
      itemCount: text.items.length,
      charCount,
      items: text.items.slice(0, MAX_TEXT_ITEMS),
    },
    linework: {
      bbox,
      coverage: pageArea > 0 ? bboxArea / pageArea : 0,
      sample,
    },
    maxFormDepth,
    markedContentSections,
    durationMs: performance.now() - started,
    warnings,
  };
}

// ── Klassifisering ──────────────────────────────────────────────────────

function nb(n: number): string {
  return n.toLocaleString('nb-NO');
}

function pct(n: number): string {
  return `${Math.round(n * 100)} %`;
}

export function classifyPage(
  paths: PdfPathStats,
  images: PdfImageStats,
  textItemCount: number,
): { contentType: PdfContentType; reason: string } {
  const S = paths.segments + paths.curves;
  const imgN = images.count;
  const Icov = images.largestCoverage;

  if (imgN === 0 && S < DECOR_FLOOR && textItemCount === 0) {
    return {
      contentType: 'empty',
      reason: `Ingen bilder, kun ${nb(S)} vektorprimitiver og ingen tekst → tom side.`,
    };
  }

  if (imgN >= 1 && Icov >= FULLPAGE_COVERAGE) {
    if (S >= LINEWORK_FLOOR) {
      return {
        contentType: 'mixed',
        reason: `Ett bilde dekker ${pct(Icov)} av siden, og det finnes ${nb(S)} vektorprimitiver (≥ ${nb(LINEWORK_FLOOR)}) → blandet.`,
      };
    }
    return {
      contentType: 'raster',
      reason: `Ett bilde dekker ${pct(Icov)} av siden, og kun ${nb(S)} vektorprimitiver (< ${nb(LINEWORK_FLOOR)}) → rasterbasert.`,
    };
  }

  if (S >= LINEWORK_FLOOR) {
    return {
      contentType: 'vector',
      reason: `${nb(S)} vektorprimitiver (≥ ${nb(LINEWORK_FLOOR)}) og ingen helsidedekkende bilde → vektorbasert.`,
    };
  }

  if (imgN >= 1) {
    if (S >= DECOR_FLOOR) {
      return {
        contentType: 'mixed',
        reason: `${nb(imgN)} bilde(r) uten helsidedekning, sammen med ${nb(S)} vektorprimitiver → blandet.`,
      };
    }
    return {
      contentType: 'raster',
      reason: `${nb(imgN)} bilde(r) og kun ${nb(S)} vektorprimitiver (< ${nb(DECOR_FLOOR)}) → rasterbasert.`,
    };
  }

  if (S >= DECOR_FLOOR) {
    return {
      contentType: 'vector',
      reason: `${nb(S)} vektorprimitiver uten bilder → vektorbasert, men lite linjeverk (< ${nb(LINEWORK_FLOOR)}).`,
    };
  }

  return {
    contentType: 'empty',
    reason: `Kun ${nb(S)} vektorprimitiver og ingen bilder → i praksis tom.`,
  };
}

/** Aggregerer sideklassifiseringer. Tomme sider teller ikke mot helheten. */
export function aggregateContentType(pages: PdfPageAnalysis[]): PdfContentType {
  const kinds = pages.map((p) => p.contentType).filter((k) => k !== 'empty');
  if (kinds.length === 0) return 'empty';
  if (kinds.includes('mixed')) return 'mixed';
  const hasVector = kinds.includes('vector');
  const hasRaster = kinds.includes('raster');
  if (hasVector && hasRaster) return 'mixed';
  return hasVector ? 'vector' : 'raster';
}

// ── Cache ───────────────────────────────────────────────────────────────
//
// Nøkkelen er selve dokumentproxyen, så cachen dør sammen med dokumentet.
// Ingen invalidering å holde styr på, ingenting som blir liggende igjen etter
// ny opplasting, og ingenting som må inn i zustand eller localStorage.

const cache = new WeakMap<PdfDoc, Map<number, PdfPageAnalysis>>();

export async function analyzePageCached(
  doc: PdfDoc,
  pageNumber: number,
  opts: AnalyzeOptions = {},
): Promise<PdfPageAnalysis> {
  let perDoc = cache.get(doc);
  if (!perDoc) {
    perDoc = new Map();
    cache.set(doc, perDoc);
  }
  const hit = perDoc.get(pageNumber);
  if (hit) return hit;

  const result = await analyzePage(doc, pageNumber, opts);
  // Avkortede/avbrutte resultater caches ikke – de skal kunne kjøres på nytt.
  if (!result.truncated) perDoc.set(pageNumber, result);
  return result;
}

export function getCachedPages(doc: PdfDoc): PdfPageAnalysis[] {
  const perDoc = cache.get(doc);
  if (!perDoc) return [];
  return [...perDoc.values()].sort((a, b) => a.pageNumber - b.pageNumber);
}

// ── Dokumentnivå ────────────────────────────────────────────────────────

interface PdfInfoLike {
  PDFFormatVersion?: string;
  Producer?: string;
  Creator?: string;
}

/**
 * Analyserer flere sider sekvensielt, med et pust mellom hver side slik at
 * hovedtråden ikke låses på et stort dokument.
 */
export async function analyzeDocument(
  doc: PdfDoc,
  fileName: string | null,
  pageNumbers: number[],
  opts: AnalyzeOptions = {},
): Promise<PdfDocAnalysis> {
  const started = performance.now();

  let info: PdfInfoLike = {};
  try {
    const meta = await doc.getMetadata();
    info = (meta.info ?? {}) as PdfInfoLike;
  } catch {
    // Metadata er ren bonus – aldri en grunn til å feile analysen.
  }

  const pages: PdfPageAnalysis[] = [];
  for (const n of pageNumbers) {
    if (opts.shouldCancel?.()) break;
    pages.push(await analyzePageCached(doc, n, opts));
    await new Promise((r) => setTimeout(r, 0));
  }

  return {
    fileName,
    numPages: doc.numPages,
    pdfVersion: info.PDFFormatVersion ?? null,
    producer: info.Producer ?? null,
    creator: info.Creator ?? null,
    pages,
    contentType: aggregateContentType(pages),
    durationMs: performance.now() - started,
  };
}
