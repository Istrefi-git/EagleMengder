// Modulnivå-holder for react-konva Stage-instansen, satt av PdfCanvas ved mount. Lar
// TopBar (og i forlengelsen PrintableReport) utløse en eksport av hele tegningen uten
// at Stage-referansen må sendes gjennom mange lag med props.

import type Konva from 'konva';

let currentStage: Konva.Stage | null = null;

export function registerStage(stage: Konva.Stage | null) {
  currentStage = stage;
}

/** Fanger HELE tegningen (ikke bare det synlige utsnittet) som en PNG data-URL, til
 * bruk i PDF-eksporten (PrintableReport). Nullstiller stagens pan/zoom midlertidig til
 * 1:1 ved origo slik at hele PDF-siden (pageWidth × pageHeight i bildekoordinater)
 * kommer med, uansett hvor brukeren har zoomet/panorert til – Konva rendrer også
 * innhold utenfor det synlige viewportet, så dette fanger alt som er tegnet.
 * Gjenoppretter visningen etterpå uansett utfall. */
export function captureDrawingDataUrl(pageWidth: number, pageHeight: number): string | null {
  const stage = currentStage;
  if (!stage || pageWidth <= 0 || pageHeight <= 0) return null;
  const prevScale = { x: stage.scaleX(), y: stage.scaleY() };
  const prevPos = { x: stage.x(), y: stage.y() };
  try {
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    stage.draw();
    return stage.toDataURL({ x: 0, y: 0, width: pageWidth, height: pageHeight, pixelRatio: 2 });
  } catch {
    return null;
  } finally {
    stage.scale(prevScale);
    stage.position(prevPos);
    stage.draw();
  }
}
