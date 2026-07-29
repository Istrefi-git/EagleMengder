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

import { Util } from 'pdfjs-dist';
import { RENDER_SCALE } from './scale';
import { walkPageOperators } from './pdfOperatorWalk';
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
  kind: 'line' | 'rect' | 'close' | 'curve';
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

// ── Hovedanalyse av én side ─────────────────────────────────────────────

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

/**
 * Teller opp hva siden faktisk inneholder.
 *
 * Selve tolkningen av operatorlisten ligger i `walkPageOperators` og deles med
 * geometriuttrekket (fase 2), slik at det bare finnes ÉN implementasjon av
 * transformasjonsstacken og constructPath-dekodingen.
 *
 * Kurver flates bevisst IKKE ut her – de telles bare. Utflating koster tid og
 * minne som diagnostikken ikke trenger.
 */
export async function analyzePage(
  doc: PdfDoc,
  pageNumber: number,
  opts: AnalyzeOptions = {},
): Promise<PdfPageAnalysis> {
  const started = performance.now();
  const warnings: string[] = [];

  const paths = emptyPathStats();
  const imageItems: PdfImageItem[] = [];
  let imageCount = 0;
  let maskCount = 0;
  let inlineCount = 0;
  const sample: SampledSegment[] = [];
  let bbox: LineworkBBox | null = null;

  const walk = await walkPageOperators(
    doc,
    pageNumber,
    {
      onPath(p) {
        paths.constructPathOps++;

        if (p.paint === 'clip') {
          // Klippebaner ekskluderes bevisst fra linjeverket. Alle arkitekt-PDF-er
          // klipper viewporten med et sidestort rektangel; teller man det som
          // geometri, ser selv en blank side ut til å ha linjeverk, og
          // linjeverk-bboxen blir alltid hele siden.
          paths.clipPaths++;
          return;
        }

        if (p.paint === 'stroke') paths.strokedPaths++;
        else if (p.paint === 'fill') paths.filledPaths++;
        else if (p.paint === 'both') {
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
          else if (s.kind === 'close') paths.closeSegments++;

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
      },

      onImage(img) {
        imageCount++;
        if (img.kind === 'mask') maskCount++;
        if (img.kind === 'inline') inlineCount++;
        if (imageItems.length < MAX_IMAGE_ITEMS) imageItems.push(img);
      },

      onGroupedImage() {
        imageCount++;
      },
    },
    {
      flattenCurves: false,
      maxOps: MAX_OPS,
      shouldCancel: opts.shouldCancel,
    },
  );

  // Dekningsgrad regnes ut etter gjennomgangen, siden sidearealet først er
  // kjent når walkeren har lest viewporten.
  const pageArea = walk.widthPx * walk.heightPx;
  let largestCoverage = 0;
  let totalCoverage = 0;
  if (pageArea > 0) {
    for (const it of imageItems) {
      const coverage = (it.width * it.height) / pageArea;
      if (coverage > largestCoverage) largestCoverage = coverage;
      totalCoverage = Math.min(1, totalCoverage + coverage);
    }
  }

  const images: PdfImageStats = {
    count: imageCount,
    maskCount,
    inlineCount,
    largestCoverage,
    totalCoverage,
    items: imageItems,
  };

  if (walk.truncated) {
    warnings.push(
      `Analysen stoppet etter ${MAX_OPS.toLocaleString('nb-NO')} operatorer – tallene er ufullstendige.`,
    );
  }
  if (walk.sawGroupedImageOps) {
    warnings.push(
      'Siden bruker grupperte/repeterte bilde-operatorer. De er talt, men bidrar ikke til dekningsgrad.',
    );
  }
  if (walk.markedContentSections > 0) {
    warnings.push(
      `Siden har ${walk.markedContentSections} marked content-seksjoner (mulige lag/OCG). Skjulte lag telles med i fase 1.`,
    );
  }

  const text = await extractText(doc, pageNumber, RENDER_SCALE);
  const charCount = text.items.reduce((n, t) => n + t.text.length, 0);
  const { contentType, reason } = classifyPage(paths, images, text.items.length);

  const bb = bbox as LineworkBBox | null;
  const bboxArea = bb ? Math.max(0, bb.maxX - bb.minX) * Math.max(0, bb.maxY - bb.minY) : 0;

  return {
    pageNumber,
    rotation: walk.rotation,
    widthPt: walk.widthPt,
    heightPt: walk.heightPt,
    widthPx: walk.widthPx,
    heightPx: walk.heightPx,
    renderScale: walk.renderScale,
    contentType,
    classificationReason: reason,
    operatorCount: walk.operatorCount,
    truncated: walk.truncated,
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
    maxFormDepth: walk.maxFormDepth,
    markedContentSections: walk.markedContentSections,
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
