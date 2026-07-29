// Delt gjennomgang av en PDF-sides operatorliste.
//
// Både analysen (fase 1) og geometriuttrekket (fase 2) trenger nøyaktig samme
// tolkning av PDF-ens tegneoperatorer: transformasjonsstack, dekoding av
// constructPath og plassering av bilder. Den logikken bor HER, i én kopi.
//
// Grunnen til at det er verdt en egen modul: detaljene er små og lette å ta
// feil av på måter som ikke krasjer, men stille gir gale koordinater – f.eks.
// at gjeldende punkt etter et rektangel er rektangelets origo, eller hvor mange
// tall hver sub-operator konsumerer fra den flate argumentrekken. To kopier av
// den logikken ville før eller siden drevet fra hverandre.
//
// Om pdfjs-importen: se kommentaren i pdfAnalysis.ts. Worker-oppsettet eies
// fortsatt av pdf.ts alene.

import { OPS, Util } from 'pdfjs-dist';
import { RENDER_SCALE } from './scale';
import type { PdfDoc } from './pdf';

export type Matrix = number[];

export type PaintKind = 'stroke' | 'fill' | 'both' | 'clip' | 'none';

export interface WalkSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Strekbredde i bilde-piksler (skalert med gjeldende CTM). */
  lineWidth: number;
  kind: 'line' | 'rect' | 'close' | 'curve';
}

export interface WalkPath {
  paint: PaintKind;
  /** Ferdig transformerte segmenter i bilde-pikselrom. */
  segments: WalkSegment[];
  subpaths: number;
  rectangles: number;
  /** Antall Bézier-sub-ops – talt uansett om de flates ut eller ikke. */
  curves: number;
}

export interface WalkImage {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'xobject' | 'inline' | 'mask';
}

export interface WalkHandlers {
  /** Kalles én gang per ferdig bane, etter at malingsoperatoren er sett. */
  onPath?: (path: WalkPath) => void;
  onImage?: (img: WalkImage) => void;
  /** Grupperte/repeterte bildevarianter – vi teller dem, men gjetter ikke bbox. */
  onGroupedImage?: () => void;
  onMarkedContent?: () => void;
}

export interface WalkOptions {
  /** Flat ut Bézier-kurver til segmenter. Av som standard (fase 1 teller kun). */
  flattenCurves?: boolean;
  /** Maks avvik i bilde-piksler ved utflating. */
  curveTolerancePx?: number;
  maxOps?: number;
  shouldCancel?: () => boolean;
}

export interface WalkResult {
  rotation: number;
  widthPt: number;
  heightPt: number;
  widthPx: number;
  heightPx: number;
  renderScale: number;
  operatorCount: number;
  truncated: boolean;
  maxFormDepth: number;
  markedContentSections: number;
  sawGroupedImageOps: boolean;
}

export const DEFAULT_MAX_OPS = 400_000;
export const DEFAULT_CURVE_TOLERANCE_PX = 0.25;

/** Hvor ofte `shouldCancel` sjekkes. */
const CANCEL_CHECK_INTERVAL = 20_000;

/** Rekursjonstak for kurve-subdivisjon – beskytter mot degenererte kurver. */
const MAX_CURVE_DEPTH = 16;

function applyPoint(m: Matrix, x: number, y: number): [number, number] {
  const p = Util.applyTransform([x, y], m);
  return [p[0], p[1]];
}

function scaleOf(m: Matrix): number {
  return Math.hypot(m[0], m[1]) || 1;
}

/**
 * Adaptiv de Casteljau-subdivisjon av en kubisk Bézier.
 *
 * Kontrollpunktene er allerede transformert til bilde-pikselrom når denne
 * kalles. Det er med vilje: en affin transformasjon avbilder en Bézier på en
 * Bézier, så utflating etterpå gir nøyaktig samme kurve – og da er toleransen
 * direkte i piksler i stedet for i en vilkårlig brukerenhet som varierer med
 * sidens skalering.
 */
function flattenCubic(
  out: number[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  tol: number,
  depth: number,
): void {
  const dx = x3 - x0;
  const dy = y3 - y0;
  const chordSq = dx * dx + dy * dy;

  if (depth >= MAX_CURVE_DEPTH) {
    out.push(x3, y3);
    return;
  }

  if (chordSq < 1e-12) {
    // Degenerert korde (start == slutt, f.eks. en løkke): fall tilbake på hvor
    // langt kontrollpunktene stikker ut, ellers ville flathetstesten aldri slå til.
    const s1 = (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0);
    const s2 = (x2 - x0) * (x2 - x0) + (y2 - y0) * (y2 - y0);
    if (Math.max(s1, s2) < tol * tol) {
      out.push(x3, y3);
      return;
    }
  } else {
    // Avstand fra hvert kontrollpunkt til korden (uten kvadratrot).
    const d1 = Math.abs((x1 - x3) * dy - (y1 - y3) * dx);
    const d2 = Math.abs((x2 - x3) * dy - (y2 - y3) * dx);
    const sum = d1 + d2;
    if (sum * sum <= tol * chordSq) {
      out.push(x3, y3);
      return;
    }
  }

  const x01 = (x0 + x1) / 2;
  const y01 = (y0 + y1) / 2;
  const x12 = (x1 + x2) / 2;
  const y12 = (y1 + y2) / 2;
  const x23 = (x2 + x3) / 2;
  const y23 = (y2 + y3) / 2;
  const x012 = (x01 + x12) / 2;
  const y012 = (y01 + y12) / 2;
  const x123 = (x12 + x23) / 2;
  const y123 = (y12 + y23) / 2;
  const xm = (x012 + x123) / 2;
  const ym = (y012 + y123) / 2;

  flattenCubic(out, x0, y0, x01, y01, x012, y012, xm, ym, tol, depth + 1);
  flattenCubic(out, xm, ym, x123, y123, x23, y23, x3, y3, tol, depth + 1);
}

/**
 * Går gjennom sidens operatorliste og rapporterer baner og bilder via callbacks.
 *
 * Koordinatkontrakt: transformasjonsmatrisen seedes med `viewport.transform`
 * ved RENDER_SCALE, altså nøyaktig samme viewport som `renderPage` bruker.
 * Alt som rapporteres er derfor i det pikselrommet appen allerede lagrer
 * tegnede entiteter i.
 */
export async function walkPageOperators(
  doc: PdfDoc,
  pageNumber: number,
  handlers: WalkHandlers,
  opts: WalkOptions = {},
): Promise<WalkResult> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const opList = await page.getOperatorList();
  const { fnArray, argsArray } = opList;

  const flatten = opts.flattenCurves ?? false;
  const tol = opts.curveTolerancePx ?? DEFAULT_CURVE_TOLERANCE_PX;
  const maxOps = opts.maxOps ?? DEFAULT_MAX_OPS;

  let ctm: Matrix = viewport.transform.slice();
  const stack: Matrix[] = [];
  let lineWidth = 1;
  let formDepth = 0;
  let maxFormDepth = 0;
  let markedContentSections = 0;
  let sawGroupedImageOps = false;
  let truncated = false;
  let pending: WalkPath | null = null;
  let pendingIsClip = false;

  const limit = Math.min(fnArray.length, maxOps);
  if (fnArray.length > maxOps) truncated = true;

  function emit(x1: number, y1: number, x2: number, y2: number, kind: WalkSegment['kind']) {
    if (!pending) return;
    const [dx1, dy1] = applyPoint(ctm, x1, y1);
    const [dx2, dy2] = applyPoint(ctm, x2, y2);
    pending.segments.push({
      x1: dx1,
      y1: dy1,
      x2: dx2,
      y2: dy2,
      lineWidth: lineWidth * scaleOf(ctm),
      kind,
    });
  }

  /** Emitterer et allerede transformert segment (brukt av kurve-utflatingen). */
  function emitDevice(x1: number, y1: number, x2: number, y2: number) {
    if (!pending) return;
    pending.segments.push({
      x1,
      y1,
      x2,
      y2,
      lineWidth: lineWidth * scaleOf(ctm),
      kind: 'curve',
    });
  }

  function commit(paint: PaintKind) {
    if (!pending) return;
    const p = pending;
    pending = null;
    p.paint = pendingIsClip ? 'clip' : paint;
    pendingIsClip = false;
    handlers.onPath?.(p);
  }

  function recordImage(kind: WalkImage['kind']) {
    if (!handlers.onImage) return;
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
    handlers.onImage({
      x,
      y,
      width: Math.max(...xs) - x,
      height: Math.max(...ys) - y,
      kind,
    });
  }

  /**
   * Dekoder én constructPath. `raw` er `[ops, args, minMax]` der `args` er en
   * FLAT tallrekke som leses med løpende markør – operandantallet per sub-op
   * avgjør hvor mange tall som konsumeres.
   */
  function walkSubPath(raw: [number[], number[], number[]]) {
    const ops = raw[0] ?? [];
    const a = raw[1] ?? [];
    let j = 0;
    let x = 0;
    let y = 0;
    let startX = 0;
    let startY = 0;
    let hasCurrent = false;

    /** Flater ut en kubisk Bézier gitt i brukerkoordinater. */
    function curve(c1x: number, c1y: number, c2x: number, c2y: number, ex: number, ey: number) {
      if (!pending) return;
      pending.curves++;
      if (flatten) {
        const [p0x, p0y] = applyPoint(ctm, x, y);
        const [p1x, p1y] = applyPoint(ctm, c1x, c1y);
        const [p2x, p2y] = applyPoint(ctm, c2x, c2y);
        const [p3x, p3y] = applyPoint(ctm, ex, ey);
        const pts: number[] = [];
        flattenCubic(pts, p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, tol, 0);
        let px = p0x;
        let py = p0y;
        for (let k = 0; k < pts.length; k += 2) {
          emitDevice(px, py, pts[k], pts[k + 1]);
          px = pts[k];
          py = pts[k + 1];
        }
      }
      x = ex;
      y = ey;
      hasCurrent = true;
    }

    for (let k = 0; k < ops.length; k++) {
      switch (ops[k] | 0) {
        case OPS.rectangle: {
          const rx = a[j++];
          const ry = a[j++];
          const rw = a[j++];
          const rh = a[j++];
          const xw = rx + rw;
          const yh = ry + rh;
          if (pending) {
            pending.subpaths++;
            pending.rectangles++;
          }
          if (rw === 0 || rh === 0) {
            // pdf.js sin degenererte gren: ett strek fra hjørne til hjørne.
            emit(rx, ry, xw, yh, 'rect');
          } else {
            emit(rx, ry, xw, ry, 'rect');
            emit(xw, ry, xw, yh, 'rect');
            emit(xw, yh, rx, yh, 'rect');
            emit(rx, yh, rx, ry, 'rect');
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
          if (pending) pending.subpaths++;
          break;

        case OPS.lineTo: {
          const nx = a[j++];
          const ny = a[j++];
          if (!hasCurrent) {
            // Defensivt: lineTo uten forutgående moveTo.
            startX = nx;
            startY = ny;
            hasCurrent = true;
            if (pending) pending.subpaths++;
          } else {
            emit(x, y, nx, ny, 'line');
          }
          x = nx;
          y = ny;
          break;
        }

        // Kontrollpunkt-semantikkene er lest ut av pdf.js sin egen renderer:
        //   curveTo  – full kubisk (cp1, cp2, slutt)
        //   curveTo2 – cp1 er GJELDENDE punkt (PDFs `v`)
        //   curveTo3 – cp2 er SLUTTPUNKTET (PDFs `y`)
        case OPS.curveTo:
          curve(a[j], a[j + 1], a[j + 2], a[j + 3], a[j + 4], a[j + 5]);
          j += 6;
          break;

        case OPS.curveTo2:
          curve(x, y, a[j], a[j + 1], a[j + 2], a[j + 3]);
          j += 4;
          break;

        case OPS.curveTo3:
          curve(a[j], a[j + 1], a[j + 2], a[j + 3], a[j + 2], a[j + 3]);
          j += 4;
          break;

        case OPS.closePath:
          if (hasCurrent && (x !== startX || y !== startY)) {
            emit(x, y, startX, startY, 'close');
          }
          x = startX;
          y = startY;
          break;

        default:
          break;
      }
    }
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

      case OPS.constructPath:
        commit('none'); // en uavsluttet forrige bane
        pending = { paint: 'none', segments: [], subpaths: 0, rectangles: 0, curves: 0 };
        pendingIsClip = false;
        walkSubPath(args as [number[], number[], number[]]);
        break;

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
        pendingIsClip = true;
        break;

      case OPS.endPath:
        commit('none');
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
        sawGroupedImageOps = true;
        handlers.onGroupedImage?.();
        break;

      case OPS.beginMarkedContentProps:
        markedContentSections++;
        handlers.onMarkedContent?.();
        break;

      default:
        break;
    }
  }

  commit('none');

  return {
    rotation: page.rotate ?? 0,
    widthPt: viewport.width / RENDER_SCALE,
    heightPt: viewport.height / RENDER_SCALE,
    widthPx: Math.floor(viewport.width),
    heightPx: Math.floor(viewport.height),
    renderScale: RENDER_SCALE,
    operatorCount: fnArray.length,
    truncated,
    maxFormDepth,
    markedContentSections,
    sawGroupedImageOps,
  };
}
