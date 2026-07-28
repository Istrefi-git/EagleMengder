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
 * Gjenoppretter visningen etterpå uansett utfall.
 *
 * `page` er PDF-sidens mål i bildekoordinater (fra store.pageWidth/pageHeight). Er
 * det ikke lastet noen PDF (eller `page` er null/0×0) fanges i stedet en boks rundt
 * det som FAKTISK er tegnet (lag 1 – selve tegnelaget; lag 0 er PDF-bakgrunnen og
 * lag 2 er midlertidige overlegg/sikte/spøkelses-forhåndsvisning), med litt luft
 * rundt. Trygt fordi pan/zoom ligger på Stage-en, ikke på lagene – etter at
 * stage-transformen er nullstilt er lagets clientRect allerede i bildekoordinater. */
export function captureDrawingDataUrl(page?: { width: number; height: number } | null): string | null {
  const stage = currentStage;
  if (!stage) return null;
  const prevScale = { x: stage.scaleX(), y: stage.scaleY() };
  const prevPos = { x: stage.x(), y: stage.y() };
  try {
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    stage.draw();

    let rect: { x: number; y: number; width: number; height: number };
    if (page && page.width > 0 && page.height > 0) {
      rect = { x: 0, y: 0, width: page.width, height: page.height };
    } else {
      const content = stage.getLayers()[1];
      const r = content?.getClientRect();
      if (!r || r.width < 1 || r.height < 1) return null; // tomt ark – ingenting å eksportere
      const pad = 24;
      rect = { x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
    }
    // Tak på oppløsningen: en stor PDF-side eller en vid bbox sprenger ellers
    // nettleserens maks canvas-størrelse og toDataURL returnerer tomt/kastet feil.
    const pixelRatio = Math.min(2, 4000 / Math.max(rect.width, rect.height));
    return stage.toDataURL({ ...rect, pixelRatio });
  } catch {
    return null;
  } finally {
    stage.scale(prevScale);
    stage.position(prevPos);
    stage.draw();
  }
}
