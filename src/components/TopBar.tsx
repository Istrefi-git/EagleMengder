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
  Printer,
  Redo2,
  Ruler,
  Settings2,
  Sun,
  Undo2,
  Upload,
} from 'lucide-react';
import { useStore } from '../store';
import { detectScaleFromPdf, loadPdf } from '../lib/pdf';
import { savePdfBytes } from '../lib/pdfStorage';
import { buildQuantityReport } from '../lib/quantityReport';
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
  const isLoading = useStore((s) => s.isLoading);
  const scale = useStore((s) => s.scale);
  const view = useStore((s) => s.view);

  const beginLoad = useStore((s) => s.beginLoad);
  const loadDocument = useStore((s) => s.loadDocument);
  const setError = useStore((s) => s.setError);
  const setPage = useStore((s) => s.setPage);
  const zoomBy = useStore((s) => s.zoomBy);
  const requestFit = useStore((s) => s.requestFit);
  const openScaleDialog = useStore((s) => s.openScaleDialog);
  const openSettingsDialog = useStore((s) => s.openSettingsDialog);
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
  const pageWidth = useStore((s) => s.pageWidth);
  const pageHeight = useStore((s) => s.pageHeight);
  const setPrintImage = useStore((s) => s.setPrintImage);
  const hasData = lines.length > 0 || symbols.length > 0;

  function exportExcel() {
    const report = buildQuantityReport(
      lines,
      symbols,
      transitions,
      branches,
      scale,
      standardLengths,
      bends,
      clamps,
      customComponents,
    );
    // Samme gruppering/sortering som brukeren har valgt i mengdelisten (QuantityPanel),
    // slik at eksporten alltid stemmer med det som vises på skjermen.
    const groups = groupQuantity(report, {
      groupBy: quantityGroupBy,
      sortBy: quantitySortBy,
      sortDir: quantitySortDir,
    });
    downloadQuantityExcel(groups, tilbudName);
  }

  /** Fanger hele tegningen som bilde FØR utskrift, slik at PrintableReport kan vise
   * den på egen side foran mengdeliste-tabellen. window.print() plukker kun opp det
   * som ALLEREDE er malt OG DEKODET i DOM-en: to requestAnimationFrame gir React tid
   * til å rendre <img>, og img.decode() venter til selve data-URL-en er dekodet –
   * uten dette kunne utskriften starte mot et tomt/udekodet bilde. */
  async function printReport() {
    const dataUrl = captureDrawingDataUrl(pageWidth > 0 && pageHeight > 0 ? { width: pageWidth, height: pageHeight } : null);
    setPrintImage(dataUrl);

    if (dataUrl) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const img = document.querySelector<HTMLImageElement>('.printable-drawing img');
      if (img) {
        try {
          await img.decode();
        } catch {
          // Dekodefeil skal ikke blokkere utskrift av selve mengdelisten.
        }
      }
    }

    // Ikke nullstill bildet før utskriften faktisk er ferdig – gjør man det rett
    // etter window.print() kan siden rekke å re-rendre uten tegningen mens
    // utskriftsdialogen fortsatt er åpen.
    const clear = () => setPrintImage(null);
    window.addEventListener('afterprint', clear, { once: true });
    // Sikkerhetsnett: noen nettlesere/plattformer fyrer aldri afterprint.
    window.setTimeout(() => {
      window.removeEventListener('afterprint', clear);
      clear();
    }, 60000);
    window.print();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    beginLoad();
    try {
      const buf = await file.arrayBuffer();
      // Kopier bytes til IndexedDB-lagring FØR pdf.js får dem – getDocument()
      // overfører/nuller ofte den originale ArrayBuffer-en til sin worker.
      const bytesForStorage = buf.slice(0);
      const doc = await loadPdf(buf);
      const detected = await detectScaleFromPdf(doc);
      loadDocument(doc, file.name, doc.numPages, detected);
      void savePdfBytes(tilbudId, bytesForStorage);
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
          hidden
          onChange={onFile}
        />
        {fileName && <span className="file-name" title={fileName}>{fileName}</span>}
      </div>

      {numPages > 0 && (
        <div className="topbar-group pager">
          <button className="btn icon" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1}>
            <ChevronLeft size={15} />
          </button>
          <span className="page-indicator">
            Side {currentPage} / {numPages}
          </span>
          <button
            className="btn icon"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= numPages}
          >
            <ChevronRight size={15} />
          </button>
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
        </IconMenu>
      </div>
    </header>
  );
}
