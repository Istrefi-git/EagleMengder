import { useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Cylinder,
  Download,
  Eye,
  FileSpreadsheet,
  Maximize2,
  Minus,
  Moon,
  Pencil,
  Printer,
  Redo2,
  Ruler,
  ScanSearch,
  Settings2,
  Sun,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import { useStore } from '../store';
import { detectScaleFromPdf, loadPdf } from '../lib/pdf';
import { savePdfBytes, deletePdfBytes } from '../lib/pdfStorage';
import { buildQuantityReportsByDrawing } from '../lib/quantityReport';
import { groupQuantity } from '../lib/quantityGroups';
import { downloadQuantityExcel } from '../lib/exportExcel';
import { captureDrawingDataUrl } from '../lib/stageCapture';
import { IconMenu } from './IconMenu';

interface Props {
  tilbudId: string;
  tilbudName: string;
}

export function TopBar({ tilbudId, tilbudName }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  const fileName = useStore((s) => s.fileName);
  const numPages = useStore((s) => s.numPages);
  const currentPage = useStore((s) => s.currentPage);
  const drawings = useStore((s) => s.drawings);
  const isLoading = useStore((s) => s.isLoading);
  const scale = useStore((s) => s.scale);
  const view = useStore((s) => s.view);

  const beginLoad = useStore((s) => s.beginLoad);
  const addPdf = useStore((s) => s.addPdf);
  const renameDrawing = useStore((s) => s.renameDrawing);
  const removeDrawing = useStore((s) => s.removeDrawing);
  const setError = useStore((s) => s.setError);
  const setPage = useStore((s) => s.setPage);
  const zoomBy = useStore((s) => s.zoomBy);
  const requestFit = useStore((s) => s.requestFit);
  const openScaleDialog = useStore((s) => s.openScaleDialog);
  const openSettingsDialog = useStore((s) => s.openSettingsDialog);
  const openPdfAnalysisDialog = useStore((s) => s.openPdfAnalysisDialog);
  const pipeRenderStyle = useStore((s) => s.pipeRenderStyle);
  const setPipeRenderStyle = useStore((s) => s.setPipeRenderStyle);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.history.past.length > 0);
  const canRedo = useStore((s) => s.history.future.length > 0);
  const lines = useStore((s) => s.lines);
  const symbols = useStore((s) => s.symbols);
  const transitions = useStore((s) => s.transitions);
  const branches = useStore((s) => s.branches);
  const bends = useStore((s) => s.bends);
  const clamps = useStore((s) => s.clamps);
  const customComponents = useStore((s) => s.customComponents);
  const standardLengths = useStore((s) => s.standardLengths);
  const quantityGroupBy = useStore((s) => s.quantityGroupBy);
  const quantitySortBy = useStore((s) => s.quantitySortBy);
  const quantitySortDir = useStore((s) => s.quantitySortDir);
  const setPrintSections = useStore((s) => s.setPrintSections);
  const hasData = lines.length > 0 || symbols.length > 0;

  function exportExcel() {
    // Én rapport per tegning (egen målestokk hver) – se buildQuantityReportsByDrawing.
    const byDrawing = buildQuantityReportsByDrawing(
      drawings,
      lines,
      symbols,
      transitions,
      branches,
      standardLengths,
      bends,
      clamps,
      customComponents,
    );
    // Totalen slår sammen RADENE (allerede i mm, altså skala-uavhengige) fra alle
    // tegningene – IKKE en ny rapport bygget fra de rå, sammenslåtte entitetene, som
    // ville vært feil så snart to tegninger har ulik målestokk.
    const totalGroups = groupQuantity({ rows: byDrawing.flatMap((d) => d.report.rows) }, {
      groupBy: quantityGroupBy,
      sortBy: quantitySortBy,
      sortDir: quantitySortDir,
    });
    const perDrawing = byDrawing.map((d) => ({
      name: d.drawingName,
      groups: groupQuantity(d.report, { groupBy: quantityGroupBy, sortBy: quantitySortBy, sortDir: quantitySortDir }),
    }));
    downloadQuantityExcel(totalGroups, perDrawing, tilbudName);
  }

  /** Fanger tegningen for ÉN gitt tegning (side.width/height leses FRISKT fra
   * store-tilstanden, ikke fra denne komponentens props/state, siden funksjonen
   * kalles midt i en løkke som bytter aktiv tegning – se printReport). */
  function captureCurrentDrawing(): string | null {
    const s = useStore.getState();
    return captureDrawingDataUrl(s.pageWidth > 0 && s.pageHeight > 0 ? { width: s.pageWidth, height: s.pageHeight } : null);
  }

  /** Fanger ETT bilde per tegning FØR utskrift, slik at PrintableReport kan vise en
   * egen seksjon (bilde + mengdeliste) per tegning i tillegg til totalen. Bytter
   * aktiv tegning fram og tilbake for å få riktig sidebilde/entiteter montert for
   * hver – med en kort ventetid per bytte for at PdfCanvas' asynkrone PDF-side-
   * rendring (renderPage → setPageImage) skal rekke å fullføre. Gjenoppretter
   * opprinnelig aktiv tegning til slutt, uansett utfall. window.print() plukker kun
   * opp det som ALLEREDE er malt OG DEKODET i DOM-en: to requestAnimationFrame gir
   * React tid til å rendre <img>-ene, og img.decode() venter til data-URL-ene er
   * dekodet – uten dette kunne utskriften startet mot tomme/udekodede bilder. */
  async function printReport() {
    const originalPage = currentPage;
    const sections: { drawingId: number; image: string | null }[] = [];
    try {
      for (const d of drawings) {
        if (d.id !== originalPage) {
          setPage(d.id);
          await new Promise((r) => setTimeout(r, 350));
        }
        sections.push({ drawingId: d.id, image: captureCurrentDrawing() });
      }
    } finally {
      if (drawings.some((d) => d.id === originalPage)) {
        setPage(originalPage);
        await new Promise((r) => setTimeout(r, 350));
      }
    }
    setPrintSections(sections);

    if (sections.some((s) => s.image)) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const imgs = document.querySelectorAll<HTMLImageElement>('.printable-drawing img');
      await Promise.all(
        Array.from(imgs).map((img) =>
          img.decode().catch(() => {
            // Dekodefeil skal ikke blokkere utskrift av selve mengdelisten.
          }),
        ),
      );
    }

    // Ikke nullstill bildene før utskriften faktisk er ferdig – gjør man det rett
    // etter window.print() kan siden rekke å re-rendre uten tegningene mens
    // utskriftsdialogen fortsatt er åpen.
    const clear = () => setPrintSections(null);
    window.addEventListener('afterprint', clear, { once: true });
    // Sikkerhetsnett: noen nettlesere/plattformer fyrer aldri afterprint.
    window.setTimeout(() => {
      window.removeEventListener('afterprint', clear);
      clear();
    }, 60000);
    window.print();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    beginLoad();
    try {
      // Flere filer kan lastes opp samtidig – hver blir en ny tegning (eller flere,
      // ved en flersidig PDF), UTEN å røre tegninger som allerede finnes.
      for (const file of files) {
        const buf = await file.arrayBuffer();
        // Kopier bytes til IndexedDB-lagring FØR pdf.js får dem – getDocument()
        // overfører/nuller ofte den originale ArrayBuffer-en til sin worker.
        const bytesForStorage = buf.slice(0);
        const doc = await loadPdf(buf);
        const detected = await detectScaleFromPdf(doc);
        const pdfId = addPdf(doc, file.name, doc.numPages, detected);
        void savePdfBytes(tilbudId, pdfId, bytesForStorage);
      }
    } catch (err) {
      setError(`Kunne ikke åpne PDF: ${(err as Error).message}`);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const scaleClass =
    scale.source === 'none' ? 'scale-pill warn' : 'scale-pill ok';

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <Ruler size={15} />
        </span>
        <div className="brand-text">
          <strong>IstrefiCAD</strong>
          <span>VVS &amp; Ventilasjon</span>
        </div>
      </div>

      <div className="topbar-group">
        <button className="btn primary" onClick={() => fileInput.current?.click()}>
          {isLoading ? (
            'Laster…'
          ) : (
            <>
              <Upload size={14} />
              Last opp PDF
            </>
          )}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={onFile}
        />
      </div>

      {drawings.length > 0 && (
        <div className="topbar-group pager">
          <button
            className="btn icon"
            onClick={() => {
              const i = drawings.findIndex((d) => d.id === currentPage);
              if (i > 0) setPage(drawings[i - 1].id);
            }}
            disabled={drawings.findIndex((d) => d.id === currentPage) <= 0}
            title="Forrige tegning"
          >
            <ChevronLeft size={15} />
          </button>
          <select
            className="drawing-select"
            value={currentPage}
            onChange={(e) => setPage(Number(e.target.value))}
            title={fileName ?? undefined}
          >
            {drawings.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            className="btn icon"
            onClick={() => {
              const i = drawings.findIndex((d) => d.id === currentPage);
              if (i >= 0 && i < drawings.length - 1) setPage(drawings[i + 1].id);
            }}
            disabled={drawings.findIndex((d) => d.id === currentPage) >= drawings.length - 1}
            title="Neste tegning"
          >
            <ChevronRight size={15} />
          </button>
          <span className="page-indicator">
            {drawings.findIndex((d) => d.id === currentPage) + 1} / {drawings.length}
          </span>
          <IconMenu icon={Pencil} label="Tegning">
            <span className="icon-menu-heading">{fileName}</span>
            <button
              className="icon-menu-item"
              onClick={() => {
                const name = window.prompt('Nytt navn på tegningen', fileName ?? '');
                if (name && name.trim()) renameDrawing(currentPage, name.trim());
              }}
            >
              <Pencil size={14} />
              Gi nytt navn
            </button>
            <button
              className="icon-menu-item danger"
              onClick={() => {
                if (window.confirm(`Fjerne tegningen «${fileName}»? Alt tegnet på den forsvinner.`)) {
                  const orphanedPdfId = removeDrawing(currentPage);
                  if (orphanedPdfId) void deletePdfBytes(tilbudId, orphanedPdfId);
                }
              }}
            >
              <Trash2 size={14} />
              Fjern tegning
            </button>
          </IconMenu>
        </div>
      )}

      <div className="topbar-group">
        <button className="btn icon" onClick={undo} disabled={!canUndo} title="Angre (Ctrl+Z)">
          <Undo2 size={14} />
        </button>
        <button className="btn icon" onClick={redo} disabled={!canRedo} title="Gjenta (Ctrl+Y)">
          <Redo2 size={14} />
        </button>
      </div>

      <IconMenu icon={Download} label="Eksporter">
        <span className="icon-menu-heading">Eksporter mengdeliste</span>
        <button className="icon-menu-item" onClick={exportExcel} disabled={!hasData}>
          <FileSpreadsheet size={14} />
          Excel (.xlsx)
        </button>
        <button className="icon-menu-item" onClick={printReport} disabled={!hasData}>
          <Printer size={14} />
          Skriv ut / PDF
        </button>
      </IconMenu>

      <div className="topbar-spacer" />

      <button className={scaleClass} onClick={() => openScaleDialog(scale.source === 'none' ? 'auto' : 'manual')}>
        <span className="scale-dot" />
        Målestokk: {scale.label}
      </button>

      <div className="topbar-group zoomer">
        <button className="btn icon" onClick={() => zoomBy(1 / 1.2)} title="Zoom ut">−</button>
        <span className="zoom-indicator">{Math.round(view.scale * 100)}%</span>
        <button className="btn icon" onClick={() => zoomBy(1.2)} title="Zoom inn">+</button>
        <button
          className="btn icon"
          onClick={requestFit}
          disabled={numPages === 0}
          title="Tilpass til skjerm"
        >
          <Maximize2 size={14} />
        </button>
        <IconMenu icon={Eye} label="Visning">
          <span className="icon-menu-heading">Rør-visning</span>
          <div className="seg-toggle">
            <button
              className={`seg-toggle-btn ${pipeRenderStyle === 'cylinder' ? 'active' : ''}`}
              onClick={() => setPipeRenderStyle('cylinder')}
              title="Sylinderformet (3D)"
            >
              <Cylinder size={14} />
            </button>
            <button
              className={`seg-toggle-btn ${pipeRenderStyle === 'flat' ? 'active' : ''}`}
              onClick={() => setPipeRenderStyle('flat')}
              title="Enkel strek"
            >
              <Minus size={14} />
            </button>
          </div>
          <span className="icon-menu-heading">Fargetema</span>
          <div className="seg-toggle">
            <button
              className={`seg-toggle-btn ${theme === 'light' ? 'active' : ''}`}
              onClick={() => setTheme('light')}
              title="Lys modus"
            >
              <Sun size={14} />
            </button>
            <button
              className={`seg-toggle-btn ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme('dark')}
              title="Mørk modus"
            >
              <Moon size={14} />
            </button>
          </div>
          <button className="icon-menu-item" onClick={openSettingsDialog}>
            <Settings2 size={14} />
            Innstillinger
          </button>
          <button
            className="icon-menu-item"
            onClick={openPdfAnalysisDialog}
            disabled={numPages === 0}
            title="Vis hva PDF-en faktisk inneholder: vektorgeometri, tekst og bilder"
          >
            <ScanSearch size={14} />
            PDF-analyse
          </button>
        </IconMenu>
      </div>
    </header>
  );
}
