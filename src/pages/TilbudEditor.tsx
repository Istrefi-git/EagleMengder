import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { Toolbar } from '../components/Toolbar';
import { PdfCanvas } from '../components/PdfCanvas';
import { QuantityPanel } from '../components/QuantityPanel';
import { PropertiesPanel } from '../components/PropertiesPanel';
import { ScaleDialog } from '../components/ScaleDialog';
import { SettingsDialog } from '../components/SettingsDialog';
import { PdfAnalysisDialog } from '../components/PdfAnalysisDialog';
import { PrintableReport } from '../components/PrintableReport';
import { OffLineConfirmDialog } from '../components/OffLineConfirmDialog';
import { useStore } from '../store';
import { useProjectsStore } from '../lib/projectsStore';
import { loadPdfBytes } from '../lib/pdfStorage';
import { loadPdf } from '../lib/pdf';

function getHint(tool: string): string | null {
  if (tool.startsWith('line:'))
    return (
      'Klikk for knekkpunkter · skriv et tall for eksakt lengde (Tab = vinkel) · ' +
      'Shift tegner fritt · Backspace angrer siste punkt · høyreklikk, dobbeltklikk ' +
      'eller Enter avslutter · Esc avbryter'
    );
  if (tool.startsWith('symbol:')) return 'Klikk på tegningen for å plassere symbolet';
  if (tool === 'calibrate') return 'Klikk to punkter med kjent avstand for å kalibrere målestokken';
  if (tool === 'pan') return 'Dra for å panorere · rull for å zoome';
  if (tool === 'move' || tool === 'copy')
    return 'Velg objekter · klikk et basispunkt · klikk der de skal havne · skriv et tall for eksakt avstand i mm · Shift låser vinkel';
  if (tool === 'split') return 'Klikk på et rør/en kanal for å dele det i to der du klikker';
  if (tool === 'tag') return 'Klikk på et rør, en kanal eller en komponent for å merke det';
  if (tool === 'select')
    return (
      'Klikk for å velge · Shift-klikk for flere · dra for gummibånd · høyreklikk på et rør ' +
      'eller en kanal åpner en meny · merket rør med åpen ende: høyreklikk plusset for å fortsette'
    );
  if (tool === 'measure:distance') return 'Klikk to punkter · snapper til endepunkter og utstyr';
  if (tool === 'measure:area') return 'Klikk punkt for punkt rundt rommet · Enter lukker figuren';
  if (tool.startsWith('annotation:')) return 'Klikk og dra – eller klikk, flytt, klikk – for å tegne';
  return null;
}

export default function TilbudEditor() {
  const { projectId, tilbudId } = useParams<{ projectId: string; tilbudId: string }>();

  const project = useProjectsStore((s) => s.projects.find((p) => p.id === projectId));
  const tilbud = useProjectsStore((s) => s.tilbud.find((t) => t.id === tilbudId));
  const saveTilbudSnapshot = useProjectsStore((s) => s.saveTilbudSnapshot);

  const error = useStore((s) => s.error);
  const theme = useStore((s) => s.theme);
  const focusMode = useStore((s) => s.focusMode);
  const toggleFocusMode = useStore((s) => s.toggleFocusMode);
  const tool = useStore((s) => s.tool);
  const lines = useStore((s) => s.lines);
  const symbols = useStore((s) => s.symbols);
  const transitions = useStore((s) => s.transitions);
  const annotations = useStore((s) => s.annotations);
  const scale = useStore((s) => s.scale);
  const lineConfig = useStore((s) => s.lineConfig);
  const fileName = useStore((s) => s.fileName);
  const numPages = useStore((s) => s.numPages);
  const currentPage = useStore((s) => s.currentPage);
  const exportSnapshot = useStore((s) => s.exportSnapshot);
  const importSnapshot = useStore((s) => s.importSnapshot);
  const resetWorkspace = useStore((s) => s.resetWorkspace);
  const attachPdfDoc = useStore((s) => s.attachPdfDoc);
  const setError = useStore((s) => s.setError);

  const loadedTilbudId = useRef<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Setter fargetema (lys/mørk) på dokumentet – påvirker kun :root-variablene i
  // styles.css (tegneverktøyet), ikke .site-scopet som dashboard/landing bruker.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Esc avslutter fokusmodus (lerretet er skjult, men fortsatt montert, så dette
  // er uavhengig av PdfCanvas sin egen Escape-håndtering for tegneverktøy).
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleFocusMode();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode, toggleFocusMode]);

  // Last inn lagret mengdedata + ev. tegning når man åpner et tilbud
  useEffect(() => {
    if (!tilbud || !tilbudId) return;
    if (loadedTilbudId.current === tilbudId) return;
    loadedTilbudId.current = tilbudId;

    resetWorkspace();
    importSnapshot(tilbud.snapshot);

    loadPdfBytes(tilbudId)
      .then(async (bytes) => {
        if (!bytes) return;
        const doc = await loadPdf(bytes);
        attachPdfDoc(doc, doc.numPages);
      })
      .catch((err) => setError(`Kunne ikke gjenopprette tegning: ${(err as Error).message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tilbudId, tilbud]);

  // Lagre mengdedata til tilbudet fortløpende
  useEffect(() => {
    if (!tilbudId || loadedTilbudId.current !== tilbudId) return;
    saveTilbudSnapshot(tilbudId, exportSnapshot());
    setLastSavedAt(new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tilbudId, lines, symbols, transitions, annotations, scale, lineConfig, fileName, numPages, currentPage]);

  if (!project || !tilbud) {
    return <Navigate to="/dashboard" replace />;
  }

  const hint = getHint(tool);

  return (
    <div className="app">
      <div className="editor-breadcrumb">
        <Link to={`/projects/${project.id}`}>{project.name}</Link>
        <ChevronRight size={13} />
        <span>{tilbud.name}</span>
        {lastSavedAt && (
          <span className="save-indicator">
            Lagret kl. {lastSavedAt.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>
      <TopBar tilbudId={tilbud.id} tilbudName={tilbud.name} />
      <div className={`workspace ${focusMode ? 'focus-mode' : ''}`}>
        <Toolbar />
        <main className="stage-area">
          <PdfCanvas />
          {hint && <div className="hint-bar">{hint}</div>}
          {error && <div className="error-toast">{error}</div>}
        </main>
        <div className="right-rail">
          <QuantityPanel />
          <PropertiesPanel />
        </div>
      </div>
      <ScaleDialog />
      <SettingsDialog />
      <PdfAnalysisDialog />
      <OffLineConfirmDialog />
      <PrintableReport tilbudName={tilbud.name} />
    </div>
  );
}
