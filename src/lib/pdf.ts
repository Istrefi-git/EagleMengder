// PDF-lasting og rendering med PDF.js.

import * as pdfjsLib from 'pdfjs-dist';
// Vite-vennlig worker-import (gir en URL til worker-filen)
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { RENDER_SCALE, metersPerPixelFromScale } from './scale';
import type { ScaleState } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfDoc = pdfjsLib.PDFDocumentProxy;

export async function loadPdf(data: ArrayBuffer): Promise<PdfDoc> {
  const loadingTask = pdfjsLib.getDocument({ data });
  return loadingTask.promise;
}

export interface RenderedPage {
  canvas: HTMLCanvasElement;
  width: number; // piksler (= viewport-bredde * RENDER_SCALE)
  height: number;
}

/** Rendrer én side til en offscreen canvas i RENDER_SCALE. */
export async function renderPage(doc: PdfDoc, pageNumber: number): Promise<RenderedPage> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Kunne ikke opprette 2D-kontekst');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return { canvas, width: canvas.width, height: canvas.height };
}

// ── Automatisk målestokk-deteksjon ──────────────────────────────────────
//
// Søker gjennom tekstinnholdet i PDF-en etter et 1:xx-mønster. Treff like
// ved en målestokk-etikett (MÅLESTOKK/SKALA/SCALE) prioriteres; ellers
// brukes første plausible "1:xx" som faller tilbake. Krever at PDF-en har
// innebygd/søkbar tekst – fungerer ikke på en rent skannet rastertegning.

const KEYWORD_SCALE_RE = /(MÅLESTOKK|MAALESTOKK|SKALA|SCALE)\s*[:\-]?\s*1\s*[:.]\s*(\d{1,5})/i;
const GENERIC_SCALE_RE = /\b1\s*:\s*(\d{1,5})\b/g;

function findKeywordScale(text: string): number | null {
  const m = text.match(KEYWORD_SCALE_RE);
  return m ? parseInt(m[2], 10) : null;
}

function findGenericScale(text: string): number | null {
  for (const m of text.matchAll(GENERIC_SCALE_RE)) {
    const d = parseInt(m[1], 10);
    if (d >= 1 && d <= 20000) return d;
  }
  return null;
}

function buildAutoScale(denominator: number): ScaleState {
  return {
    metersPerPixel: metersPerPixelFromScale(denominator),
    label: `1:${denominator} (auto)`,
    source: 'auto',
  };
}

/** Søker gjennom sidetekst (i sidenummer-orden) etter en målestokk. Oppgis `onlyPage`
 * (1-basert), søkes det KUN i den ene siden – brukt til å gjenoppfriske målestokken
 * for én bestemt tegning (se rescanAutoScale i store.ts), i stedet for å skanne hele
 * PDF-en på nytt og risikere å plukke opp en annen sides målestokk. */
export async function detectScaleFromPdf(
  doc: PdfDoc,
  maxPages = 25,
  onlyPage?: number,
): Promise<ScaleState | null> {
  const pageNumbers =
    onlyPage != null ? [onlyPage] : Array.from({ length: Math.min(doc.numPages, maxPages) }, (_, i) => i + 1);
  let fallback: number | null = null;
  for (const i of pageNumbers) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => ('str' in it ? it.str : '')).join(' ');
    const keyworded = findKeywordScale(text);
    if (keyworded != null) return buildAutoScale(keyworded);
    if (fallback == null) fallback = findGenericScale(text);
  }
  return fallback != null ? buildAutoScale(fallback) : null;
}
