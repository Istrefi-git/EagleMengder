import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Arrow, Circle, Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import { FileSearch, Lightbulb, Plus, X } from 'lucide-react';
import { useStore } from '../store';
import { applyMovePlan, clampScale, findConnectedLineIds, openEndsOf, planMove, sharesPoint } from '../store';
import type { MovePlan, CanvasMenuTarget } from '../store';
import { renderPage } from '../lib/pdf';
import {
  CATEGORIES,
  POINT_ANNOTATION_TYPES,
  SUBCATEGORIES,
  TEXT_ANNOTATION_TYPES,
  TEXT_BOX_ANNOTATION_TYPES,
  annotationTypeLabel,
  branchFittingLabel,
  categoryOf,
  colorFor,
  defaultBranchFittingForPipe,
  dimensionsForMaterial,
  getBendAngles,
  glyphShapeFor,
  isDuctSub,
  isRectDim,
  mergedOptions,
  symbolDefFor,
  tagLabel,
} from '../types';
import type {
  AnnotationEntity,
  AnnotationType,
  BendEntity,
  BranchEntity,
  ClampEntity,
  CustomComponentDef,
  LineEntity,
  MeasurementEntity,
  MeasurementType,
  PipeRenderStyle,
  SymbolEntity,
  TagEntity,
} from '../types';
import {
  buildDuctRunWalls,
  classifyBendAngle,
  closestPointOnPolyline,
  distance,
  flattenDuctRun,
  groupDuctRuns,
  lineIntersect,
  paramAlongSegment,
  polygonArea,
  polygonCentroid,
  polylineBendAngles,
  polylineLength,
  snapFirstPoint,
  snapNextPoint,
} from '../lib/geometry';
import type { DuctRunWalls } from '../lib/geometry';
import { formatAreaM2, formatLengthMm, mmToPx } from '../lib/scale';
import { dimensionDiameterMm } from '../lib/dimension';
import { endpointHitOf, findNearestLine, lineHitTolerance } from '../lib/hitTest';
import { SymbolGlyph, BranchGlyph } from './symbols';
import { PipeTube } from './PipeTube';
import { SymbolTooltip } from './SymbolTooltip';
import { BranchChoicePopover } from './BranchChoicePopover';
import { CanvasContextMenu } from './CanvasContextMenu';
import type { CanvasMenuCommand } from './CanvasContextMenu';
import { registerStage } from '../lib/stageCapture';

/** Sant hvis tastetrykket skjer mens brukeren skriver et sted (input/textarea/select/
 * contentEditable) – bokstavsnarveiene (R/K/V/F/C/D/A) skal ALDRI trigge da. Sjekker
 * både `e.target` og `document.activeElement`, siden noen av appens flytende felt
 * (f.eks. lengde-/avstandsinntastingen) kaller `stopPropagation()` selv, men andre
 * dialoger (Innstillinger, symbolbiblioteket) ikke nødvendigvis ligger i samme
 * event-tre som der tastetrykket faktisk registreres. */
function isTypingContext(e: KeyboardEvent): boolean {
  // `e.target`/`document.activeElement` kan i prinsippet være noe som ikke er et
  // Element (f.eks. selve document eller window) – sjekk det eksplisitt før
  // DOM-metoder som getAttribute kalles, ellers kaster denne i stedet for å svare nei.
  const isTypingEl = (el: unknown): boolean => {
    if (!(el instanceof Element)) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if ((el as HTMLElement).isContentEditable) return true;
    return el.getAttribute('role') === 'textbox';
  };
  return isTypingEl(e.target) || isTypingEl(document.activeElement);
}

export function PdfCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  const pdfDoc = useStore((s) => s.pdfDoc);
  const currentPage = useStore((s) => s.currentPage);
  const pageImage = useStore((s) => s.pageImage);
  const pageWidth = useStore((s) => s.pageWidth);
  const pageHeight = useStore((s) => s.pageHeight);
  const setPageImage = useStore((s) => s.setPageImage);
  const setError = useStore((s) => s.setError);

  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const setStageSize = useStore((s) => s.setStageSize);
  const fitSignal = useStore((s) => s.fitSignal);

  const tool = useStore((s) => s.tool);
  const lines = useStore((s) => s.lines);
  const symbols = useStore((s) => s.symbols);
  const transitions = useStore((s) => s.transitions);
  const branches = useStore((s) => s.branches);
  const bends = useStore((s) => s.bends);
  const annotations = useStore((s) => s.annotations);
  const annotationConfig = useStore((s) => s.annotationConfig);
  const addAnnotation = useStore((s) => s.addAnnotation);
  const updateAnnotation = useStore((s) => s.updateAnnotation);
  const setAnnotationConfig = useStore((s) => s.setAnnotationConfig);
  const scale = useStore((s) => s.scale);
  const selectedId = useStore((s) => s.selectedId);
  const selectedKind = useStore((s) => s.selectedKind);
  const moveSelection = useStore((s) => s.moveSelection);
  const moveSingleLine = useStore((s) => s.moveSingleLine);
  const duplicateSelection = useStore((s) => s.duplicateSelection);
  const nudgeTag = useStore((s) => s.nudgeTag);
  const lineConfig = useStore((s) => s.lineConfig);
  const recentLineTypes = useStore((s) => s.recentLineTypes);
  const hoveredSymbolId = useStore((s) => s.hoveredSymbolId);
  const pipeRenderStyle = useStore((s) => s.pipeRenderStyle);

  const addLineRun = useStore((s) => s.addLineRun);
  const splitLineAt = useStore((s) => s.splitLineAt);
  const placeSymbolWithGuard = useStore((s) => s.placeSymbolWithGuard);
  const showAirflowArrows = useStore((s) => s.showAirflowArrows);
  const customSystems = useStore((s) => s.customSystems);
  const customComponents = useStore((s) => s.customComponents);
  const symbolConfig = useStore((s) => s.symbolConfig);
  const setSymbolConfig = useStore((s) => s.setSymbolConfig);
  const customDimensions = useStore((s) => s.customDimensions);
  const addCustomDimension = useStore((s) => s.addCustomDimension);
  const customColors = useStore((s) => s.customColors);
  const addTransition = useStore((s) => s.addTransition);
  const addBranch = useStore((s) => s.addBranch);
  const tags = useStore((s) => s.tags);
  const addTag = useStore((s) => s.addTag);
  const updateTagLabel = useStore((s) => s.updateTagLabel);
  const clamps = useStore((s) => s.clamps);
  const addClamp = useStore((s) => s.addClamp);
  const updateClampPosition = useStore((s) => s.updateClampPosition);
  const nudgeClamp = useStore((s) => s.nudgeClamp);
  const measurements = useStore((s) => s.measurements);
  const addMeasurement = useStore((s) => s.addMeasurement);
  const areaMeasureMode = useStore((s) => s.areaMeasureMode);
  const setAreaMeasureMode = useStore((s) => s.setAreaMeasureMode);
  const hideComponentLabels = useStore((s) => s.hideComponentLabels);
  const setPendingBranchChoice = useStore((s) => s.setPendingBranchChoice);
  const canvasMenu = useStore((s) => s.canvasMenu);
  const setCanvasMenu = useStore((s) => s.setCanvasMenu);
  const updateLineConfigDimension = useStore((s) => s.updateLineConfigDimension);
  const setLineSelection = useStore((s) => s.setLineSelection);
  const select = useStore((s) => s.select);
  const setTool = useStore((s) => s.setTool);
  const clearSelection = useStore((s) => s.clearSelection);
  const moveLineVertex = useStore((s) => s.moveLineVertex);
  const hideShiftTip = useStore((s) => s.hideShiftTip);
  const setHideShiftTip = useStore((s) => s.setHideShiftTip);
  const trimLineTo = useStore((s) => s.trimLineTo);
  const updateSymbol = useStore((s) => s.updateSymbol);
  const setHoveredSymbol = useStore((s) => s.setHoveredSymbol);
  const deleteSelected = useStore((s) => s.deleteSelected);
  const setCalibrationDistance = useStore((s) => s.setCalibrationDistance);
  const openScaleDialog = useStore((s) => s.openScaleDialog);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const beginHistoryBatch = useStore((s) => s.beginHistoryBatch);
  const endHistoryBatch = useStore((s) => s.endHistoryBatch);
  const hiddenCategories = useStore((s) => s.hiddenCategories);
  const multiSelection = useStore((s) => s.multiSelection);
  const toggleMultiSelect = useStore((s) => s.toggleMultiSelect);
  const setMultiSelection = useStore((s) => s.setMultiSelection);
  const clearMultiSelection = useStore((s) => s.clearMultiSelection);
  const deleteMany = useStore((s) => s.deleteMany);

  // Pågående tegning (polylinje) og kalibrering
  const [draftPoints, setDraftPoints] = useState<number[]>([]);
  // Sann rett etter at et rørs endepunkt er "fortsatt" (klikk-start eller dobbeltklikk-håndtak):
  // hindrer verktøybytte-effekten under i å nullstille draftPoints som nettopp ble forhåndsfylt.
  const preserveDraftRef = useRef(false);
  // Det andre (ikke-delte) endepunktet til røret/kanalen man nettopp har fortsatt tegningen fra –
  // brukes KUN til å beregne Shift-vinkelsnapping og en ev. bend-markør akkurat i skjøtepunktet,
  // uten å slå sammen det gamle segmentet med det nye (som fortsatt skal være separate enheter).
  const [continuationAnchor, setContinuationAnchor] = useState<{ x: number; y: number } | null>(null);
  // Midlertidig tekst mens man legger til en egendefinert verdi på et "customizable"
  // symbolfelt (f.eks. spjelds dimensjon) fra symbol-huden – key identifiserer hvilket
  // felt inputen gjelder, siden bare ett felt kan redigeres om gangen.
  const [customFieldInput, setCustomFieldInput] = useState<{ key: string; value: string } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [calibPoints, setCalibPoints] = useState<number[]>([]);
  // Pågående punkt-til-punkt/areal-måling (klikk for å legge til punkter, akkurat
  // som kalibrering/linjetegning) – nullstilles når målingen fullføres eller avbrytes.
  const [measureDraftPoints, setMeasureDraftPoints] = useState<number[]>([]);
  // Dimensjonen som brukes for resten av linjen man tegner nå (kan byttes midt i tegningen)
  const [draftDimension, setDraftDimension] = useState<string | null>(null);
  // Valgfritt egendefinert system (fra Innstillinger) for linjen/utstyret man tegner/plasserer nå
  const [draftSystemId, setDraftSystemId] = useState<string>('');
  const [showShiftTip, setShowShiftTip] = useState(false);
  // Gummibånd-utvalg (klikk+dra på tomt lerret i velg-modus)
  const [rubberBand, setRubberBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );
  // Trim/Forleng (C6): klikk 1 armerer grensen (holdes armert til Escape eller
  // verktøybytte, slik at flere segmenter kan trimmes/forlenges mot samme grense).
  const [trimBoundaryId, setTrimBoundaryId] = useState<string | null>(null);
  // Klikk+dra-definisjon av en ny sky-annotasjon (rektangel, à la gummibånd)
  const [cloudDraft, setCloudDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );
  // Klikk+dra-definisjon av en boks-basert markup-annotasjon (rektangel, ellipse,
  // markering/highlight, tekstboks) – samme mønster som cloudDraft.
  const [boxDraft, setBoxDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // Klikk+dra-definisjon av en linje/pil-annotasjon.
  const [lineDraft, setLineDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // Fler-klikk-akkumulerte punkter for en polygon-annotasjon (lukkes ved klikk nær
  // startpunktet eller Enter, samme mønster som areal-målingsverktøyet).
  const [polygonDraftPoints, setPolygonDraftPoints] = useState<number[]>([]);
  // Id til tekst-annotasjonen som redigeres inline akkurat nå (dobbeltklikk)
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  // Forhåndsvisning av hva som skjer hvis man klikker nå (kun rør/kanal-/utstyrsverktøy):
  // fortsetter et eksisterende rør, setter inn en avgreining, eller monterer utstyr.
  const [hoverSnap, setHoverSnap] = useState<{
    line: LineEntity;
    x: number;
    y: number;
    kind: 'continue' | 'branch' | 'mount' | 'split' | 'trim-boundary' | 'trim' | 'extend';
  } | null>(null);
  // Snap-indikator for måleverktøyene (avstand/areal) – hvilken type punkt musepekeren
  // akkurat nå er snappet til, kun til visning (selve punktet som brukes er `cursor`).
  const [measureSnapKind, setMeasureSnapKind] = useState<'endpoint' | 'online' | 'symbol' | 'close' | null>(null);
  // Klikk+dra-definisjon av en rektangulær arealmåling (kun når arealmodus = 'rect')
  const [rectDraft, setRectDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // Flytt/Kopier: basispunkt satt av første klikk. Selve gjeldende forskyvning leses
  // ut av `cursor` (samme punkt-state som måleverktøyene bruker til forhåndsvisning).
  const [transformBase, setTransformBase] = useState<{ x: number; y: number } | null>(null);
  // Planen (hvilke id-er som skal flyttes/kopieres) beregnes ÉN gang ved gest-start
  // (planMove kjører en BFS over sammenhengende linjer) og fryses for resten av gesten,
  // slik at spøkelses-forhåndsvisningen ikke må regne den ut på nytt for hver musebevegelse.
  const transformPlanRef = useRef<MovePlan | null>(null);
  // Numerisk avstandsinntasting (Revit/AutoCAD-stil): første siffertast under en
  // pågående flytte-/kopier-gest åpner dette feltet; Enter flytter/kopierer nøyaktig
  // den oppgitte avstanden (mm) langs retningen pekeren peker akkurat nå.
  const [distanceEntry, setDistanceEntry] = useState<{ value: string; screenX: number; screenY: number } | null>(
    null,
  );
  // Numerisk lengde/vinkel-inntasting mens man tegner rør/kanal (Revit/AutoCAD-stil):
  // første siffertast etter minst ett plassert punkt åpner dette feltet. `field` er
  // hvilket av de to tallfeltene som har fokus akkurat nå (Tab bytter). Holdt ATSKILT
  // fra distanceEntry – Flytt/Kopier og tegning skal ikke dele tilstand her, siden
  // committen deres er fundamentalt ulik (den ene avslutter en gest, den andre
  // legger til et punkt og fortsetter tegningen).
  const [lineEntry, setLineEntry] = useState<{
    length: string;
    angle: string;
    field: 'length' | 'angle';
    screenX: number;
    screenY: number;
  } | null>(null);
  const lineEntryLengthRef = useRef<HTMLInputElement>(null);
  const lineEntryAngleRef = useRef<HTMLInputElement>(null);
  // Midlertidig panorering ved å holde inne Mellomrom (og dra med venstre knapp),
  // uavhengig av aktivt verktøy – mister ikke pågående tegning/måling.
  const [isSpacePan, setIsSpacePan] = useState(false);
  const spacePanRef = useRef(false);
  // Holdes kun for å vise vinkellås-brikken i draw-huden som «løst» mens Shift er nede
  // – selve snap-logikken leser e.evt.shiftKey direkte og er uavhengig av denne.
  const [shiftHeld, setShiftHeld] = useState(false);
  // Manuell panorering med midtre museknapp (musehjul-klikk + dra).
  const middlePanRef = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const invScale = 1 / view.scale;
  const isLineTool = tool.startsWith('line:');
  const isSymbolTool = tool.startsWith('symbol:');
  const isAnnotationTool = tool.startsWith('annotation:');
  const annotationType = isAnnotationTool ? (tool.slice('annotation:'.length) as AnnotationType) : null;
  const isMeasureTool = tool.startsWith('measure:');
  const measureType = isMeasureTool ? (tool.slice('measure:'.length) as MeasurementType) : null;
  const isTransformTool = tool === 'move' || tool === 'copy';
  const isPan = tool === 'pan';
  const activeSubId = isLineTool ? tool.slice('line:'.length) : null;
  const activeSub = activeSubId ? SUBCATEGORIES[activeSubId] : null;
  const activeMaterial = activeSubId ? lineConfig[activeSubId]?.material : undefined;
  const activeBendAngles = activeMaterial ? getBendAngles(activeMaterial) : [];

  // ── Flytt/Kopier: avbryt/fullfør pågående gest ────────────────────────
  // Definert tidlig (før onKey-effekten lenger ned) slik at Escape-håndteringen kan
  // referere resetTransform uten en «brukt før deklarert»-feil.
  const resetTransform = useCallback(() => {
    setTransformBase(null);
    transformPlanRef.current = null;
    setDistanceEntry(null);
  }, []);

  /** R/K-hurtigtasten: armerer sist brukte rør-/kanaltype av rett art. Er verktøyet
   * allerede en type av den arten, sykles det til NESTE i «sist brukt» (Revits
   * PI-analog: gjentatt trykk bytter mellom nylig brukte typer). Finnes ingen
   * «sist brukt» av arten ennå, faller den tilbake på første underkategori av
   * riktig art med katalogens standardverdier. Definert tidlig, som resetTransform
   * over, slik at onKey-effekten kan referere den. */
  const armRecentLineKind = useCallback(
    (kind: 'pipe' | 'duct') => {
      const ofKind = recentLineTypes.filter((r) => categoryOf(r.subId)?.kind === kind);
      if (ofKind.length > 0) {
        const curIdx = ofKind.findIndex(
          (r) => tool === `line:${r.subId}` && lineConfig[r.subId]?.material === r.material,
        );
        const next = ofKind[(curIdx + 1) % ofKind.length];
        setLineSelection(next.subId, next.material, next.dimension);
        return;
      }
      const cat = CATEGORIES.find((c) => c.kind === kind);
      const sub = cat?.subs[0];
      if (!sub) return;
      const material = sub.materials[0];
      const dims = dimensionsForMaterial(sub, material, customDimensions);
      setLineSelection(sub.id, material, dims[0] ?? sub.dimensions[0]);
    },
    [recentLineTypes, tool, lineConfig, setLineSelection, customDimensions],
  );

  // Registrerer Stage-instansen i stageCapture-modulen, slik at TopBar/PrintableReport
  // kan fange hele tegningen som bilde til PDF-eksport uten å måtte sende Stage-refen
  // gjennom props.
  useEffect(() => {
    registerStage(stageRef.current);
    return () => registerStage(null);
  }, []);

  // ── Container-størrelse ──────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      setSize(next);
      setStageSize(next);
    });
    ro.observe(el);
    const initial = { width: el.clientWidth, height: el.clientHeight };
    setSize(initial);
    setStageSize(initial);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tilpasser visningen slik at hele siden får plass og sentreres
  function fitView(width: number, height: number) {
    const el = containerRef.current;
    if (!el || !width || !height) return;
    const fit = Math.min(el.clientWidth / width, el.clientHeight / height) * 0.95;
    const s = clampScale(fit);
    setView({
      scale: s,
      x: (el.clientWidth - width * s) / 2,
      y: (el.clientHeight - height * s) / 2,
    });
  }

  // ── Render PDF-side ──────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    renderPage(pdfDoc, currentPage)
      .then(({ canvas, width, height }) => {
        if (cancelled) return;
        setPageImage(canvas, width, height);
        fitView(width, height);
      })
      .catch((err) => {
        if (!cancelled) setError(`Kunne ikke rendre side: ${err.message}`);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, currentPage]);

  // Tilpass på forespørsel (knapp i topbar)
  useEffect(() => {
    if (fitSignal > 0) fitView(pageWidth, pageHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  // ── Tastatur ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingContext(e)) return;
      // Kontekstmenyen lukkes med sitt eget Escape-trykk – ellers ville samme Escape
      // BÅDE lukket menyen OG f.eks. avbrutt en pågående tegning, som er to effekter
      // av ett tastetrykk. Trykk Escape igjen for å gå videre til den vanlige oppførselen.
      if (e.key === 'Escape' && canvasMenu) {
        setCanvasMenu(null);
        return;
      }
      // Samme «ett Escape av gangen»-prinsipp som kontekstmenyen over: med en armert
      // grense tømmer det første Escape-trykket KUN grensen (så man kan velge en annen
      // uten å miste hele verktøyet); trykk Escape igjen for å gå til «Velg».
      if (e.key === 'Escape' && tool === 'trimextend' && trimBoundaryId) {
        setTrimBoundaryId(null);
        return;
      }
      if (e.key === 'Escape') {
        // Midt i en flytte-/kopier-gest (basispunkt satt): avbryt KUN gesten og behold
        // utvalget/verktøyet, slik at man kan prøve et nytt basispunkt med det samme.
        if (isTransformTool && transformBase) {
          resetTransform();
          return;
        }
        // Avbryt all pågående tegning/markup.
        setDraftPoints([]);
        setContinuationAnchor(null);
        setLineEntry(null);
        setCalibPoints([]);
        setMeasureDraftPoints([]);
        setPolygonDraftPoints([]);
        setCloudDraft(null);
        setBoxDraft(null);
        setLineDraft(null);
        setRectDraft(null);
        // Fra et tegne-/markup-/måle-/symbol-/tag-/kalibrer-/rediger-verktøy → tilbake
        // til «Velg» (ikke «Panorer» – man vil som regel fortsette å jobbe med det man
        // nettopp tegnet/valgte, ikke navigere). Ellers (allerede velg/panorer) tømmer
        // vi bare utvalget.
        const inDrawingTool =
          isLineTool ||
          isAnnotationTool ||
          isMeasureTool ||
          isSymbolTool ||
          tool === 'tag' ||
          tool === 'calibrate' ||
          tool === 'move' ||
          tool === 'copy' ||
          tool === 'split' ||
          tool === 'trimextend';
        if (inDrawingTool) {
          setTool('select');
        } else {
          clearSelection();
          clearMultiSelection();
        }
      } else if (e.key === 'Enter' && draftPoints.length >= 4 && isLineTool) {
        finishLine();
      } else if (e.key === 'Enter' && measureType === 'area' && measureDraftPoints.length >= 6) {
        addMeasurement('area', measureDraftPoints);
        setMeasureDraftPoints([]);
      } else if (e.key === 'Enter' && annotationType === 'polygon' && polygonDraftPoints.length >= 6) {
        addAnnotation('polygon', 0, 0, { points: polygonDraftPoints });
        setPolygonDraftPoints([]);
      } else if (
        isTransformTool &&
        transformBase &&
        !distanceEntry &&
        /^[0-9]$/.test(e.key) &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        // Revit/AutoCAD-stil: første siffer under en pågående flytte-/kopier-gest åpner
        // avstandsfeltet. Videre tastetrykk (sifre, komma, Backspace, Enter) går til selve
        // <input>-en og fanges dermed av INPUT-vakten øverst i denne handleren.
        if (!scale.metersPerPixel || !cursor) return; // uten målestokk finnes ingen mm å skrive inn
        e.preventDefault();
        setDistanceEntry({
          value: e.key,
          screenX: cursor.x * view.scale + view.x,
          screenY: cursor.y * view.scale + view.y,
        });
      } else if (
        isLineTool &&
        draftPoints.length >= 2 &&
        !lineEntry &&
        /^[0-9]$/.test(e.key) &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        // Samme Revit/AutoCAD-idiom som Flytt/Kopier over: første siffer etter minst
        // ett plassert punkt åpner et lengde-/vinkelfelt i stedet for å legge til et
        // knekkpunkt på museposisjonen.
        if (!scale.metersPerPixel) {
          setError('Sett målestokk for å skrive inn en eksakt lengde');
          return;
        }
        e.preventDefault();
        const n = draftPoints.length;
        const anchor = cursor ?? { x: draftPoints[n - 2], y: draftPoints[n - 1] };
        setLineEntry({
          length: e.key,
          angle: '',
          field: 'length',
          screenX: anchor.x * view.scale + view.x,
          screenY: anchor.y * view.scale + view.y,
        });
      } else if (isLineTool && draftPoints.length >= 2 && e.key === 'Backspace') {
        // Fjerner siste plasserte knekkpunkt i strekningen som pågår – MÅ sjekkes før
        // den generelle Delete/Backspace-grenen under, ellers ville Backspace slettet
        // FORRIGE ferdige strekning (addLineRun lar den stå markert) i stedet for å
        // angre siste punkt i den man holder på med nå.
        e.preventDefault();
        setDraftPoints((prev) => prev.slice(0, -2));
        if (draftPoints.length === 2) setContinuationAnchor(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (multiSelection.size > 0) deleteMany(Array.from(multiSelection));
        else deleteSelected();
      } else if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.repeat &&
        ['v', 'f', 'c', 'd', 'a', 'r', 'k', 't'].includes(e.key.toLowerCase())
      ) {
        // Ett-tasts hurtigtaster (norske mnemonikker): V velg, F flytt, C kopier,
        // D del, A avstand, R rør, K kanal, T trim/forleng (fri, matcher Revits TR).
        // R/K armerer sist brukte type av den arten – trykkes de igjen sykles det
        // gjennom «sist brukt».
        const k = e.key.toLowerCase();
        if (k === 'v') { e.preventDefault(); setTool('select'); }
        else if (k === 'f') { e.preventDefault(); setTool('move'); }
        else if (k === 'c') { e.preventDefault(); setTool('copy'); }
        else if (k === 'd') { e.preventDefault(); setTool('split'); }
        else if (k === 't') { e.preventDefault(); setTool('trimextend'); }
        else if (k === 'a') { e.preventDefault(); setTool('measure:distance'); }
        else if (k === 'r' || k === 'k') {
          e.preventDefault();
          armRecentLineKind(k === 'r' ? 'pipe' : 'duct');
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        redo();
      } else if (
        tool === 'select' &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        (selectedKind === 'line' || multiSelection.size > 0)
      ) {
        // Flytter valgt(e) kanal/rør ett skjermpiksel av gangen (Shift for et større hopp).
        // moveSelection dispatcher internt til riktig semantikk (vinkelbevarende
        // én-linje vs. rigid strekning), akkurat som Flytt-verktøyet – se planMove.
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) * invScale;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        moveSelection(dx, dy, !e.repeat);
      } else if (
        tool === 'select' &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        selectedKind === 'tag' &&
        selectedId
      ) {
        // Flytter valgt tag-etikett ett skjermpiksel av gangen (Shift for et større hopp).
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) * invScale;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        nudgeTag(selectedId, dx, dy, !e.repeat);
      } else if (
        tool === 'select' &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        selectedKind === 'clamp' &&
        selectedId
      ) {
        // Flytter valgt klammer ett skjermpiksel av gangen (Shift for et større hopp).
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) * invScale;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        nudgeClamp(selectedId, dx, dy, !e.repeat);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftPoints,
    isLineTool,
    multiSelection,
    tool,
    selectedKind,
    selectedId,
    invScale,
    moveSelection,
    moveSingleLine,
    nudgeTag,
    nudgeClamp,
    measureType,
    measureDraftPoints,
    addMeasurement,
    annotationType,
    polygonDraftPoints,
    addAnnotation,
    isAnnotationTool,
    isMeasureTool,
    isSymbolTool,
    clearSelection,
    clearMultiSelection,
    isTransformTool,
    transformBase,
    distanceEntry,
    resetTransform,
    scale.metersPerPixel,
    cursor,
    view,
    lineEntry,
    setError,
    setTool,
    armRecentLineKind,
    setContinuationAnchor,
    canvasMenu,
    setCanvasMenu,
    trimBoundaryId,
    setTrimBoundaryId,
  ]);

  // Hold inne Mellomrom for å panorere (dra med venstre knapp), uansett aktivt
  // verktøy og uten å miste pågående tegning/måling. Ignorerer tastetrykk mens man
  // skriver i et tekstfelt.
  useEffect(() => {
    const isTypingTarget = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isTypingTarget()) {
        e.preventDefault();
        spacePanRef.current = true;
        setIsSpacePan(true);
      }
      if (e.key === 'Shift') setShiftHeld(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePanRef.current = false;
        setIsSpacePan(false);
      }
      if (e.key === 'Shift') setShiftHeld(false);
    };
    // Mister man fokus (alt-tab, klikk utenfor vinduet) mens Shift holdes, kommer
    // aldri keyup – uten dette ville brikken kunne bli hengende på «løst».
    const onBlur = () => setShiftHeld(false);
    window.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Manuell panorering med midtre museknapp: følg musen mens knappen holdes, og
  // avslutt ved slipp. Startpunkt/utgangs-view lagres i middlePanRef ved mousedown.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const pan = middlePanRef.current;
      if (!pan) return;
      setView({
        scale: viewRef.current.scale,
        x: pan.viewX + (e.clientX - pan.startX),
        y: pan.viewY + (e.clientY - pan.startY),
      });
    };
    const onUp = () => {
      middlePanRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setView]);

  // Lukk kontekstmenyen ved klikk utenfor den. Fanges i CAPTURE-fase på selve
  // containeren (ikke på Stage) – LineNode sin treff-linje setter `cancelBubble` i
  // sin egen onMouseDown, så en lytter i boble-fasen på Stage-nivå ville aldri sett
  // klikk på en ANNEN linje enn den menyen står på.
  useEffect(() => {
    if (!canvasMenu) return;
    const onDown = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest('.canvas-menu')) return;
      setCanvasMenu(null);
    };
    const el = containerRef.current;
    el?.addEventListener('mousedown', onDown, true);
    return () => el?.removeEventListener('mousedown', onDown, true);
  }, [canvasMenu, setCanvasMenu]);

  // Avbryt pågående tegning når verktøy byttes, og forbered ny tegnesesjon
  useEffect(() => {
    setCanvasMenu(null);
    setTrimBoundaryId(null);
    setCalibPoints([]);
    setCursor(null);
    setHoverSnap(null);
    setCloudDraft(null);
    setBoxDraft(null);
    setLineDraft(null);
    setPolygonDraftPoints([]);
    setRectDraft(null);
    setEditingAnnotationId(null);
    setMeasureDraftPoints([]);
    setMeasureSnapKind(null);
    setTransformBase(null);
    transformPlanRef.current = null;
    setDistanceEntry(null);
    setLineEntry(null);
    if (tool.startsWith('line:')) {
      const subId = tool.slice('line:'.length);
      setDraftDimension(lineConfig[subId]?.dimension ?? null);
      setShowShiftTip(true);
      // Ved fortsettelse av et eksisterende rør/kanal er draftPoints allerede
      // forhåndsfylt av seedContinuation() – ikke nullstill det her.
      if (preserveDraftRef.current) {
        preserveDraftRef.current = false;
      } else {
        setDraftPoints([]);
        setContinuationAnchor(null);
      }
    } else {
      setDraftDimension(null);
      setShowShiftTip(false);
      setDraftPoints([]);
      setContinuationAnchor(null);
      // Rydd flagget her også – uten dette kunne det bli stående `true` for alltid
      // hvis seedContinuation() ble kalt mens verktøyet allerede var samme
      // `line:<subId>` (da endres ikke `tool`, og denne effekten kjører aldri), og
      // en gammel, forlatt draft ville da smettet med videre neste gang man gikk
      // inn i EN HELT ANNEN tegneverktøy.
      preserveDraftRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, currentPage]);

  /** Finner nærmeste linje av en gitt kind (rør/kanal) innenfor toleranse for et punkt –
   * brukes til å snappe en ny linjes start/slutt inn på et eksisterende rør/kanal slik
   * at det automatisk settes inn en avgreiningsdel (T-rør/45°-grenrør/påstikk/T-kanal). */
  const findBranchTarget = useCallback(
    (point: { x: number; y: number }, kind: 'pipe' | 'duct') =>
      findNearestLine(
        lines.filter((l) => l.page === currentPage),
        point,
        scale.metersPerPixel,
        invScale,
        kind,
      ),
    [lines, currentPage, scale.metersPerPixel, invScale],
  );

  /** Setter inn en avgreiningsdel (eller ber bruker velge type for kanal) for et allerede
   * funnet treff, og returnerer det snappede punktet. `mode: 'auto'` (brukt av
   * connectLandedEndpoints etter Flytt/Kopier) hopper over popoveren for kanaler og
   * setter alltid inn et påstikk direkte – brukeren kan siden dobbeltklikke
   * påstikket for å bytte til T-kanal (se BranchMarker/updateBranch). */
  const insertBranchForTarget = useCallback(
    (
      target: { line: LineEntity; x: number; y: number; angleDeg: number },
      branchDimension: string,
      mode: 'ask' | 'auto' = 'ask',
    ): { x: number; y: number } => {
      const kind = categoryOf(target.line.subId)?.kind;
      if (kind === 'pipe') {
        addBranch(
          target.line.subId,
          target.line.material,
          target.line.dimension,
          branchDimension,
          defaultBranchFittingForPipe(target.line.subId),
          target.x,
          target.y,
          target.angleDeg,
        );
      } else if (mode === 'auto' || isRectDim(target.line.dimension) !== isRectDim(branchDimension)) {
        // 'auto': ventilasjon skal alltid få påstikk direkte, uten spørsmål (brukeren
        // kan bytte til T-kanal etterpå ved dobbeltklikk). Rund↔rektangulær mismatch
        // gir samme resultat uansett modus – «T-kanal» finnes ikke fysisk der.
        addBranch(
          target.line.subId,
          target.line.material,
          target.line.dimension,
          branchDimension,
          'saddle_tap',
          target.x,
          target.y,
          target.angleDeg,
        );
      } else {
        setPendingBranchChoice({
          mainSubId: target.line.subId,
          mainMaterial: target.line.material,
          mainDimension: target.line.dimension,
          branchDimension,
          x: target.x,
          y: target.y,
          angleDeg: target.angleDeg,
        });
      }
      return { x: target.x, y: target.y };
    },
    [addBranch, setPendingBranchChoice],
  );

  /** Etter en fullført Flytt/Kopier: sett inn påstikk der et ENDEPUNKT på en flyttet/
   * kopiert linje har landet MIDT PÅ kroppen til en annen kanal/rør – akkurat som når
   * man begynner å tegne en ny linje der (se mousedown-grenen for isLineTool), men nå
   * utløst av å slippe en flyttet/kopiert linje i stedet for et tegne-klikk.
   * Ventilasjon får alltid påstikk direkte (kan endres til T-kanal ved dobbeltklikk på
   * markøren, se BranchMarker/updateBranch); rør får sin normale standardtype.
   * Endepunkt-mot-endepunkt er en vanlig skjøt/bend og skal IKKE gi en avgreining.
   *
   * Leser alt fra FERSK store-tilstand (useStore.getState()), IKKE fra komponentens
   * egne `lines`/`branches` – rett etter duplicateSelection inneholder closurens
   * `lines` ikke kopiene ennå, og rett etter moveSelection har den fortsatt de GAMLE
   * koordinatene (React har ikke rukket å re-rendre komponenten). */
  const connectLandedEndpoints = useCallback(
    (movedLineIds: Set<string>) => {
      if (movedLineIds.size === 0) return;
      const mpp = scale.metersPerPixel;
      const st0 = useStore.getState();
      const page = st0.currentPage;
      const moved = st0.lines.filter((l) => movedLineIds.has(l.id) && l.page === page);
      // Ekskluder HELE det flyttede/kopierte settet fra kandidatene – ellers ville en
      // strekning kunne avgrene på sin egen nabo, eller på et vertex-punkt en annen
      // flyttet linje nettopp forlot.
      const candidates = st0.lines.filter((l) => l.page === page && !movedLineIds.has(l.id));
      if (candidates.length === 0) return;

      for (const line of moved) {
        const kind = categoryOf(line.subId)?.kind;
        if (kind !== 'pipe' && kind !== 'duct') continue;
        const n = line.points.length;
        const ends = [
          { x: line.points[0], y: line.points[1] },
          { x: line.points[n - 2], y: line.points[n - 1] },
        ];
        for (const end of ends) {
          const target = findNearestLine(candidates, end, mpp, invScale, kind);
          if (!target) continue;
          const tol = lineHitTolerance(target.line.dimension, mpp, invScale);
          // Treff nøyaktig på målets endepunkt = en vanlig skjøt/fortsettelse (delte
          // punkter, samme som når to strekk møtes i et bend) – IKKE en avgreining.
          if (endpointHitOf(target.line, target.x, target.y, tol)) continue;
          // Unngå duplikat: finnes det allerede en avgreining tilnærmet i treffpunktet
          // (typisk fordi et kopiert påstikk fulgte med i selve kopien), ikke lag en til.
          // Leses på nytt per endepunkt, siden forrige runde i denne løkka kan ha lagt
          // til nettopp en slik avgreining.
          const eps = Math.max(6 * invScale, 0.5 * mmToPx(dimensionDiameterMm(line.dimension), mpp));
          const branchesNow = useStore.getState().branches;
          if (branchesNow.some((b) => b.page === page && distance(b.x, b.y, target.x, target.y) <= eps)) continue;
          insertBranchForTarget(target, line.dimension, 'auto');
        }
      }
    },
    [scale.metersPerPixel, invScale, insertBranchForTarget],
  );

  /** Fullfører en flytte-/kopier-gest med en gitt forskyvning (px, i bildekoordinater).
   * Kalles både fra andre klikk (musepekerens avstand fra basispunktet) og fra
   * mm-feltet (avstand langs gjeldende retning).
   *
   * Hele committen (selve flyttingen/kopien OG ev. auto-innsatte påstikk via
   * connectLandedEndpoints) pakkes i ÉTT angre-steg med beginHistoryBatch/
   * endHistoryBatch – ellers ville hver enkelt addBranch (som kaller recordHistory()
   * selv) blitt sitt eget Ctrl+Z-steg oppå selve flyttingen. */
  const commitTransform = useCallback(
    (dx: number, dy: number) => {
      if (dx === 0 && dy === 0) {
        // Null forskyvning: avbryt i stedet for å committe en usynlig (dupliserende)
        // flytting/kopi – dette skjer typisk ved et rent dobbeltklikk på basispunktet.
        resetTransform();
        return;
      }
      // Må leses FØR resetTransform() nuller transformPlanRef.
      const plan = transformPlanRef.current;
      const beforeLineIds = new Set(useStore.getState().lines.map((l) => l.id));
      beginHistoryBatch();
      try {
        if (tool === 'copy') {
          duplicateSelection(dx, dy);
          const newIds = new Set(
            useStore.getState().lines.filter((l) => !beforeLineIds.has(l.id)).map((l) => l.id),
          );
          connectLandedEndpoints(newIds);
        } else {
          moveSelection(dx, dy, true);
          connectLandedEndpoints(plan ? plan.lineIds : new Set<string>());
        }
      } finally {
        endHistoryBatch();
      }
      resetTransform();
    },
    [
      tool,
      duplicateSelection,
      moveSelection,
      resetTransform,
      connectLandedEndpoints,
      beginHistoryBatch,
      endHistoryBatch,
    ],
  );

  /** Flytter/kopierer nøyaktig den oppgitte avstanden (mm), langs retningen pekeren
   * peker akkurat nå (inkl. ev. Shift-låst 45°-retning) – ikke langs pekerens egen
   * avstand fra basispunktet. */
  const commitNumericDistance = useCallback(() => {
    if (!distanceEntry || !transformBase || !cursor || !scale.metersPerPixel) return;
    const mm = parseFloat(distanceEntry.value.replace(',', '.'));
    const ddx = cursor.x - transformBase.x;
    const ddy = cursor.y - transformBase.y;
    const len = Math.hypot(ddx, ddy);
    if (!Number.isFinite(mm) || mm <= 0 || len < 1e-6) {
      setDistanceEntry(null);
      return;
    }
    const px = mmToPx(mm, scale.metersPerPixel);
    commitTransform((ddx / len) * px, (ddy / len) * px);
  }, [distanceEntry, transformBase, cursor, scale.metersPerPixel, commitTransform]);

  /** Legger til NESTE knekkpunkt i strekningen som pågår, i en eksakt oppgitt lengde
   * (mm) og evt. vinkel – i motsetning til commitNumericDistance avslutter dette IKKE
   * noe, tegningen fortsetter fra det nye punktet.
   *
   * Retning: typet vinkel hvis fylt inn, ellers musepekerens NÅVÆRENDE retning – som
   * allerede har vært gjennom computeLinePoint og dermed er vinkellåst med mindre
   * Shift holdes. Skriver man f.eks. «2400» uten vinkel mens låsen er aktiv, blir
   * resultatet dermed eksakt 2400 mm langs den låste føringen; Shift+Enter gir fri
   * retning. Er vinkelfeltet fylt ut, OVERSTYRER det låsen (typet verdi vinner alltid).
   *
   * Vinkelen betyr BØY (turn) relativt til forrige retning når det finnes en forrige
   * retning å måle mot (som snapNextPoint) – og ABSOLUTT retning på det aller første
   * segmentet (som segmentAngleDeg), siden det da ikke finnes noe å bøye FRA. */
  const commitLineEntry = useCallback(() => {
    if (!lineEntry || !scale.metersPerPixel || draftPoints.length < 2) return;
    const n = draftPoints.length;
    const px0 = draftPoints[n - 2];
    const py0 = draftPoints[n - 1];

    const mm = parseFloat(lineEntry.length.replace(',', '.'));
    const px = mmToPx(mm, scale.metersPerPixel);
    if (!Number.isFinite(px) || px <= 0) {
      setLineEntry(null);
      return;
    }

    let prevAngle: number | null = null;
    if (n >= 4) {
      // Retningen på forrige segment: fra nest siste til siste plasserte punkt.
      prevAngle = Math.atan2(py0 - draftPoints[n - 3], px0 - draftPoints[n - 4]);
    } else if (continuationAnchor) {
      prevAngle = Math.atan2(py0 - continuationAnchor.y, px0 - continuationAnchor.x);
    }

    const angleTyped = lineEntry.angle.trim() ? parseFloat(lineEntry.angle.replace(',', '.')) : null;
    let dir: number;
    if (angleTyped != null && Number.isFinite(angleTyped)) {
      dir = prevAngle != null ? prevAngle + (angleTyped * Math.PI) / 180 : (angleTyped * Math.PI) / 180;
    } else if (cursor) {
      const dx = cursor.x - px0;
      const dy = cursor.y - py0;
      dir = Math.hypot(dx, dy) > 1e-6 ? Math.atan2(dy, dx) : (prevAngle ?? 0);
    } else {
      dir = prevAngle ?? 0;
    }

    const next = { x: px0 + px * Math.cos(dir), y: py0 + px * Math.sin(dir) };
    setDraftPoints((prev) => [...prev, next.x, next.y]);
    setCursor(next);
    setLineEntry(null);
  }, [lineEntry, scale.metersPerPixel, draftPoints, continuationAnchor, cursor]);

  /** Setter inn en avgreiningsdel (eller ber bruker velge type for kanal) ved et punkt
   * der en ny linje starter/ender på et eksisterende rør/kanal. */
  const tryInsertBranch = useCallback(
    (point: { x: number; y: number }, branchDimension: string): { x: number; y: number } => {
      if (!activeSubId) return point;
      const kind = categoryOf(activeSubId)?.kind;
      if (!kind) return point;
      const target = findBranchTarget(point, kind);
      if (!target) return point;
      return insertBranchForTarget(target, branchDimension);
    },
    [activeSubId, findBranchTarget, insertBranchForTarget],
  );

  /** Snapper et målepunkt (avstand/areal-verktøy) til det mest relevante vektor-punktet i
   * nærheten – slik man er vant til fra PDF-redigeringsverktøy. Selve PDF-bakgrunnen er et
   * rasterbilde uten geometri vi kan lese ut, så snappingen bruker det vi faktisk HAR
   * vektordata for: endepunkter/nærmeste punkt på tegnede rør og kanaler, plasserte
   * utstyrspunkter, og – for arealverktøyet – tilbake til målingens eget startpunkt for å
   * lukke romfiguren presist. Prioritert i den rekkefølgen (hjørner/punkter foran «et sted
   * langs streken»), og returnerer nærmeste treff innenfor toleransen, eller null. */
  const findMeasureSnapPoint = useCallback(
    (point: { x: number; y: number }): { x: number; y: number; kind: 'endpoint' | 'online' | 'symbol' | 'close' } | null => {
      const tol = 10 * invScale;
      let best: { x: number; y: number; kind: 'endpoint' | 'online' | 'symbol' | 'close'; distance: number } | null = null;
      const consider = (x: number, y: number, kind: 'endpoint' | 'online' | 'symbol' | 'close') => {
        const d = distance(point.x, point.y, x, y);
        if (d <= tol && (!best || d < best.distance)) best = { x, y, kind, distance: d };
      };

      if (measureType === 'area' && measureDraftPoints.length >= 4) {
        consider(measureDraftPoints[0], measureDraftPoints[1], 'close');
      }
      for (const line of lines) {
        if (line.page !== currentPage) continue;
        const n = line.points.length;
        consider(line.points[0], line.points[1], 'endpoint');
        consider(line.points[n - 2], line.points[n - 1], 'endpoint');
      }
      for (const sym of symbols) {
        if (sym.page !== currentPage) continue;
        consider(sym.x, sym.y, 'symbol');
      }
      if (!best) {
        for (const line of lines) {
          if (line.page !== currentPage) continue;
          const cp = closestPointOnPolyline(line.points, point);
          if (cp) consider(cp.x, cp.y, 'online');
        }
      }
      return best;
    },
    [lines, symbols, currentPage, invScale, measureType, measureDraftPoints],
  );

  const finishLine = useCallback(() => {
    if (!isLineTool || !activeSubId) return;
    if (draftPoints.length >= 4) {
      // Sjekk om linjen ender på et eksisterende rør/kanal av samme type → avgreining
      const lastX = draftPoints[draftPoints.length - 2];
      const lastY = draftPoints[draftPoints.length - 1];
      const snapped = tryInsertBranch({ x: lastX, y: lastY }, draftDimension ?? activeSub?.dimensions[0] ?? '');
      const finalPoints =
        snapped.x !== lastX || snapped.y !== lastY
          ? [...draftPoints.slice(0, -2), snapped.x, snapped.y]
          : draftPoints;
      addLineRun(
        activeSubId,
        finalPoints,
        activeMaterial,
        draftDimension ?? undefined,
        draftSystemId || undefined,
        continuationAnchor ?? undefined,
      );
      setContinuationAnchor(null);
    }
    setDraftPoints([]);
    setCursor(null);
    setLineEntry(null);
  }, [
    isLineTool,
    activeSubId,
    draftPoints,
    addLineRun,
    activeMaterial,
    draftDimension,
    draftSystemId,
    activeSub,
    tryInsertBranch,
    continuationAnchor,
  ]);

  /** Bytter dimensjon midt i en pågående tegning: avslutter strekket så langt (som separate
   * rette segmenter), legger til en synlig overgang (kanalen/røret blir smalere/bredere
   * fra dette punktet), og fortsetter tegningen med ny dimensjon. */
  function changeDraftDimension(newDimension: string) {
    if (!activeSubId || !activeMaterial || newDimension === draftDimension) return;
    if (draftPoints.length >= 4) {
      const lastX = draftPoints[draftPoints.length - 2];
      const lastY = draftPoints[draftPoints.length - 1];
      addLineRun(
        activeSubId,
        draftPoints,
        activeMaterial,
        draftDimension ?? undefined,
        draftSystemId || undefined,
        continuationAnchor ?? undefined,
      );
      setContinuationAnchor(null);
      addTransition(activeSubId, activeMaterial, draftDimension ?? '', newDimension, lastX, lastY);
      setDraftPoints([lastX, lastY]);
    } else if (draftPoints.length === 2 && continuationAnchor) {
      // Man har akkurat fortsatt et eksisterende rør/kanal (seedContinuation) og bytter
      // dimensjon FØR neste punkt er klikket – draftPoints er da kun det ene forankrings-
      // punktet, så det finnes ingen fersk strekning å dele opp ennå. Sett overgangen
      // direkte i det punktet i stedet (continuationAnchor beholdes uendret – det peker
      // fortsatt på det gamle rørets andre endepunkt for vinkelsnapping av neste segment).
      addTransition(activeSubId, activeMaterial, draftDimension ?? '', newDimension, draftPoints[0], draftPoints[1]);
    }
    setDraftDimension(newDimension);
    updateLineConfigDimension(activeSubId, newDimension);
  }

  /** Fortsetter tegningen fra endepunktet til et allerede tegnet rett rør-/kanalsegment
   * (klikk-start på et endepunkt, eller dobbeltklikk på et endepunkt-håndtak). Dette
   * legger IKKE til punkter på det gamle segmentet – det starter bare en ny, tilstøtende
   * tegnesesjon fra samme koordinat, akkurat som når man begynner et helt nytt strekk.
   * Det andre endepunktet lagres som continuationAnchor slik at vinkelsnapping og en
   * ev. bend-markør i skjøtepunktet beregnes riktig mot det eksisterende røret.
   * Er `targetDimension` satt og forskjellig fra det eksisterende rørets dimensjon,
   * settes en overgang automatisk inn i skjøtpunktet og den nye tegningen fortsetter
   * på det nye målet (jf. «fortsett med en annen dimensjon»). */
  const seedContinuation = useCallback(
    (line: LineEntity, fromStart: boolean, targetDimension?: string) => {
      preserveDraftRef.current = true;
      setLineSelection(line.subId, line.material, line.dimension);
      const n = line.points.length;
      const shared = fromStart ? [line.points[0], line.points[1]] : [line.points[n - 2], line.points[n - 1]];
      const other = fromStart ? [line.points[n - 2], line.points[n - 1]] : [line.points[0], line.points[1]];
      setDraftPoints(shared);
      setContinuationAnchor({ x: other[0], y: other[1] });
      // Dette bytter verktøyet fra Velg til `line:<subId>` i det stille (via
      // setLineSelection over) – vis Shift-hintet med en gang som et tydelig tegn
      // på at man nå ER i tegnemodus, ellers virker neste klikk som en uforklarlig
      // ny kanal.
      setShowShiftTip(true);
      if (targetDimension && targetDimension !== line.dimension) {
        // Fortsett med et annet mål: legg inn overgang i skjøten og bruk det nye målet.
        addTransition(line.subId, line.material, line.dimension, targetDimension, shared[0], shared[1]);
        setDraftDimension(targetDimension);
        updateLineConfigDimension(line.subId, targetDimension);
      } else {
        setDraftDimension(line.dimension);
      }
    },
    [setLineSelection, addTransition, updateLineConfigDimension],
  );

  /** Utfører et valg fra høyreklikk-menyen (kroppen) eller pluss-håndtaket (åpen ende).
   * Leser linjen fra FERSK store-tilstand, ikke closurens `lines` – menyen kan ha stått
   * åpen en stund, og linjen kan i mellomtiden ha blitt slettet eller endret. */
  const handleCanvasMenuCommand = useCallback(
    (target: CanvasMenuTarget, command: CanvasMenuCommand) => {
      const line = useStore.getState().lines.find((l) => l.id === target.lineId);
      if (!line) return;

      if (target.type === 'openEnd') {
        if (command === 'continue') seedContinuation(line, target.fromStart);
        return;
      }

      // target.type === 'lineBody'
      if (command === 'branch') {
        const branchDim = lineConfig[line.subId]?.dimension ?? line.dimension;
        // IKKE seedContinuation her – den setter continuationAnchor, som addLineRun
        // mater inn i polylineBendAngles og som ville fabrikkert en falsk bend i
        // påstikkpunktet. Dette gjenskaper i stedet nøyaktig det midt-på-kroppen-
        // klikk allerede gjør i mousedown-håndteringen: sett draften direkte, uten anker.
        insertBranchForTarget({ line, x: target.x, y: target.y, angleDeg: target.angleDeg }, branchDim);
        setLineSelection(line.subId, line.material, branchDim);
        preserveDraftRef.current = true;
        setDraftPoints([target.x, target.y]);
        setContinuationAnchor(null);
        setShowShiftTip(true);
      } else if (command === 'clamp') {
        addClamp(line.id, target.x, target.y, target.angleDeg, line.dimension);
      } else if (command === 'move') {
        // Armerer det eksisterende Flytt-verktøyet i stedet for å starte et drag –
        // museknappen er allerede sluppet når menyen åpnes. Med nøyaktig én linje
        // merket gir planMove «single»-modus (nabo-strekking), som er riktig følelse.
        clearMultiSelection();
        select(line.id, 'line');
        setTool('move');
      } else if (command === 'delete') {
        select(line.id, 'line');
        deleteSelected();
      }
    },
    [
      lineConfig,
      insertBranchForTarget,
      setLineSelection,
      addClamp,
      clearMultiSelection,
      select,
      setTool,
      deleteSelected,
      seedContinuation,
    ],
  );

  const getImagePoint = useCallback((): { x: number; y: number } | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const p = stage.getRelativePointerPosition();
    return p ? { x: p.x, y: p.y } : null;
  }, []);

  /** Snapper et punkt til nærmeste tillatte bend-vinkel – ELLER til nærmeste 45°-
   * multiplum i absolutt retning for det aller første segmentet i en ny polylinje
   * (ingen forrige retning å måle turn mot) – med mindre man fortsetter et eksisterende
   * rør/kanal (continuationAnchor), da måles vinkelen i stedet mot DET rørets retning,
   * akkurat som et vanlig påfølgende segment.
   *
   * Vinkellås er PÅ som standard (Revit-stil) – Shift tegner fritt. Dette er omvendt
   * av den gamle oppførselen (Shift LÅSTE); se PLAN.md fase 4. */
  const computeLinePoint = useCallback(
    (raw: { x: number; y: number }, shiftKey: boolean): { x: number; y: number } => {
      if (shiftKey || !isLineTool) return raw;
      if (draftPoints.length === 2) {
        if (continuationAnchor) {
          return snapNextPoint(
            [continuationAnchor.x, continuationAnchor.y, draftPoints[0], draftPoints[1]],
            raw,
            activeBendAngles,
          );
        }
        return snapFirstPoint({ x: draftPoints[0], y: draftPoints[1] }, raw);
      }
      if (draftPoints.length >= 4) {
        return snapNextPoint(draftPoints, raw, activeBendAngles);
      }
      return raw;
    },
    [isLineTool, draftPoints, activeBendAngles, continuationAnchor],
  );

  // ── Hendelser ────────────────────────────────────────────────────────
  // Memoisert med useCallback: uten dette blir disse funksjonene redefinert på
  // hver render (f.eks. hver gang musen beveger seg og setCursor kalles), noe
  // som tvinger react-konva til stadig å fjerne/legge til Konva-lyttere og kan
  // gi ustabile/doble klikk-registreringer ved tegning.
  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Midtre museknapp (musehjul-klikk) starter manuell panorering – uansett
      // aktivt verktøy, uten å røre pågående tegning/måling.
      if (e.evt.button === 1) {
        e.evt.preventDefault();
        middlePanRef.current = {
          startX: e.evt.clientX,
          startY: e.evt.clientY,
          viewX: viewRef.current.x,
          viewY: viewRef.current.y,
        };
        return;
      }
      // Høyreklikk håndteres utelukkende av handleContextMenu. Uten denne vakten
      // faller button 2 gjennom hit og legger til et knekkpunkt i tegningen
      // SAMTIDIG som kontekstmenyen setter inn et klammer.
      if (e.evt.button === 2) return;
      // Mens Mellomrom holdes inne panorerer venstre-dra hele lerretet (Konva drar
      // stagen fordi draggable er på) – ikke legg til punkter/velg noe da.
      if (spacePanRef.current) return;
      // Bare reager på klikk i tomt område (selve stagen / bakgrunnen)
      const clickedEmpty = e.target === e.target.getStage();
      const p = getImagePoint();
      if (!p) return;

      if (isLineTool) {
        // Objektsnap vinner alltid over vinkellåsen (presedens: objektsnap > innskrevet
        // verdi > hjelpelinje > vinkellås > rått). Sjekkes derfor på det RÅ, ulåste
        // punktet – ellers ville en angitt/låst retning kunne dytte klikket forbi en
        // kanal man tydelig prøvde å treffe. Gjelder alle klikk i en strekning, ikke
        // bare det første, slik at man også kan avslutte MIDT i en strekning oppå en
        // annen kanal og få en avgreining der (se finishLine/tryInsertBranch for
        // tilsvarende sjekk ved dobbeltklikk/Enter-avslutning).
        const kind = activeSubId ? categoryOf(activeSubId)?.kind : undefined;
        const target = activeSubId && kind ? findBranchTarget(p, kind) : null;

        if (target) {
          const branchDim = draftDimension ?? activeSub?.dimensions[0] ?? '';
          const tol = lineHitTolerance(target.line.dimension, scale.metersPerPixel, invScale);
          const endpointHit = endpointHitOf(target.line, target.x, target.y, tol);
          const shapeMismatch = isRectDim(target.line.dimension) !== isRectDim(branchDim);
          // «Fortsett røret»-tolkningen gir bare mening som det ALLER FØRSTE punktet i
          // en ny strekning – man kan ikke «fortsette» et rør midt i en tegning man
          // allerede er i gang med.
          if (
            draftPoints.length === 0 &&
            endpointHit &&
            target.line.subId === activeSubId &&
            !shapeMismatch
          ) {
            // Har brukeren valgt et annet mål enn det eksisterende røret, settes en
            // overgang inn i skjøten automatisk.
            seedContinuation(target.line, endpointHit === 'start', draftDimension ?? undefined);
            setShowShiftTip(false);
            return;
          }
          if (endpointHit) {
            // Endepunkt-mot-endepunkt (men ikke en gyldig «fortsett»-match over) er en
            // vanlig skjøt/bend, IKKE en avgreining – samme regel som
            // connectLandedEndpoints bruker etter Flytt/Kopier. Snapp til punktet uten
            // å sette inn noe.
            setDraftPoints((prev) => [...prev, target.x, target.y]);
            setShowShiftTip(false);
            return;
          }
          // Midt-på-kroppen-treff: snapp direkte til treffpunktet og sett inn
          // avgreiningsdel, uansett hvor i strekningen vi er.
          const point = insertBranchForTarget(target, branchDim);
          setDraftPoints((prev) => [...prev, point.x, point.y]);
          setShowShiftTip(false);
          return;
        }

        const point = computeLinePoint(p, e.evt.shiftKey);
        setDraftPoints((prev) => [...prev, point.x, point.y]);
        setShowShiftTip(false);
        return;
      }
      if (isAnnotationTool && annotationType) {
        // Klikk-flytt-klikk (hybrid med dra): hvis en draft allerede er i gang, fullfør
        // den ved dette (andre) klikket – slik at man ikke må holde museknappen inne.
        if (cloudDraft) {
          const w = Math.abs(p.x - cloudDraft.x0);
          const h = Math.abs(p.y - cloudDraft.y0);
          setCloudDraft(null);
          if (w > 8 && h > 8)
            addAnnotation('cloud', Math.min(cloudDraft.x0, p.x), Math.min(cloudDraft.y0, p.y), { width: w, height: h });
          return;
        }
        if (boxDraft) {
          const w = Math.abs(p.x - boxDraft.x0);
          const h = Math.abs(p.y - boxDraft.y0);
          setBoxDraft(null);
          if (w > 8 && h > 8)
            addAnnotation(annotationType, Math.min(boxDraft.x0, p.x), Math.min(boxDraft.y0, p.y), {
              width: w,
              height: h,
            });
          return;
        }
        if (lineDraft) {
          setLineDraft(null);
          if (distance(lineDraft.x0, lineDraft.y0, p.x, p.y) > 8)
            addAnnotation(annotationType, 0, 0, { points: [lineDraft.x0, lineDraft.y0, p.x, p.y] });
          return;
        }
        if (annotationType === 'text') {
          addAnnotation('text', p.x, p.y);
        } else if (annotationType === 'callout') {
          addAnnotation('callout', p.x, p.y);
        } else if (annotationType === 'polygon') {
          // Fler-klikk, à la areal-måling: klikk nær startpunktet lukker figuren.
          const closeToStart =
            polygonDraftPoints.length >= 6 &&
            distance(p.x, p.y, polygonDraftPoints[0], polygonDraftPoints[1]) <= 10 * invScale;
          if (closeToStart) {
            addAnnotation('polygon', 0, 0, { points: polygonDraftPoints });
            setPolygonDraftPoints([]);
          } else {
            setPolygonDraftPoints((prev) => [...prev, p.x, p.y]);
          }
        } else if (annotationType === 'line' || annotationType === 'arrow') {
          setLineDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        } else if (annotationType === 'cloud') {
          setCloudDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        } else {
          // rect, ellipse, highlight, textbox: første klikk starter boksen.
          setBoxDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        }
        return;
      }
      if (isSymbolTool) {
        const type = tool.slice('symbol:'.length) as SymbolEntity['type'];
        let best: { x: number; y: number; angleDeg: number; lineId: string } | null = null;
        for (const line of lines) {
          if (line.page !== currentPage) continue;
          const cp = closestPointOnPolyline(line.points, p);
          if (!cp) continue;
          const tol = lineHitTolerance(line.dimension, scale.metersPerPixel, invScale);
          if (cp.distance <= tol && (!best || cp.distance < distance(p.x, p.y, best.x, best.y))) {
            best = { x: cp.x, y: cp.y, angleDeg: cp.angleDeg, lineId: line.id };
          }
        }
        const sysId = draftSystemId || undefined;
        if (best) placeSymbolWithGuard(type, best.x, best.y, best.angleDeg, best.lineId, sysId);
        else placeSymbolWithGuard(type, p.x, p.y, 0, undefined, sysId);
        return;
      }
      if (tool === 'tag') {
        // Tag festes kun til et rør/kanal – klikk i tomt rom gjør ingenting, siden
        // en tag uten tilknyttet linje ikke har noe å vise.
        let best: { x: number; y: number; distance: number; lineId: string } | null = null;
        for (const line of lines) {
          if (line.page !== currentPage) continue;
          const cp = closestPointOnPolyline(line.points, p);
          if (!cp) continue;
          const tol = lineHitTolerance(line.dimension, scale.metersPerPixel, invScale);
          if (cp.distance <= tol && (!best || cp.distance < best.distance)) {
            best = { x: cp.x, y: cp.y, distance: cp.distance, lineId: line.id };
          }
        }
        if (best) addTag(best.lineId, best.x, best.y);
        return;
      }
      if (isTransformTool) {
        // Klikk-flytt-klikk: første klikk setter basispunktet (og fryser HVA som skal
        // flyttes/kopieres via planMove), andre klikk committer forskyvningen. Shift
        // låser retningen til nærmeste 45°-multiplum (samme snapFirstPoint som
        // tegne-/måleverktøyene bruker); ellers snappes det til nærmeste vektorpunkt
        // – samme snap som måleverktøyene, så man treffer nøyaktig et endepunkt.
        if (!transformBase) {
          const plan = planMove(useStore.getState());
          if (!plan) return; // ingenting valgt – klikket gjør ingenting
          transformPlanRef.current = plan;
          const start = findMeasureSnapPoint(p) ?? p;
          setTransformBase(start);
          setCursor(start);
          return;
        }
        const snapped = e.evt.shiftKey ? snapFirstPoint(transformBase, p) : (findMeasureSnapPoint(p) ?? p);
        commitTransform(snapped.x - transformBase.x, snapped.y - transformBase.y);
        return;
      }
      if (tool === 'split') {
        // Nærmeste rør/kanal innenfor toleranse – samme idiom som findBranchTarget –
        // deles nøyaktig der man klikket. Bli i verktøyet etterpå (ikke setTool('select')),
        // slik at man kan dele flere rør/kanaler på rad; egenskapspanelet fungerer
        // uavhengig av aktivt verktøy og lar deretter dimensjonen på halvdelen endres.
        let best: { lineId: string; x: number; y: number; distance: number } | null = null;
        for (const line of lines) {
          if (line.page !== currentPage) continue;
          const cp = closestPointOnPolyline(line.points, p);
          if (!cp) continue;
          const tol = lineHitTolerance(line.dimension, scale.metersPerPixel, invScale);
          if (cp.distance <= tol && (!best || cp.distance < best.distance)) {
            best = { lineId: line.id, x: cp.x, y: cp.y, distance: cp.distance };
          }
        }
        if (best) splitLineAt(best.lineId, best.x, best.y, 'a');
        return;
      }
      if (tool === 'trimextend') {
        // Klikk 1: velg grensen. Klikk 2: velg målet + siden (P) man klikket på.
        const hit = findNearestLine(
          lines.filter((l) => l.page === currentPage),
          p,
          scale.metersPerPixel,
          invScale,
        );
        if (!hit) return;
        if (!trimBoundaryId) {
          setTrimBoundaryId(hit.line.id);
          return;
        }
        if (hit.line.id === trimBoundaryId) return; // samme linje som grensen – ignorer
        const boundary = lines.find((l) => l.id === trimBoundaryId && l.page === currentPage);
        if (!boundary) {
          // Grensen ble slettet e.l. i mellomtiden – behandle dette klikket som et
          // nytt forsøk på å velge grense i stedet for å feile stille.
          setTrimBoundaryId(hit.line.id);
          return;
        }
        const target = hit.line;
        const bn = boundary.points.length;
        const bStart = { x: boundary.points[0], y: boundary.points[1] };
        const bEnd = { x: boundary.points[bn - 2], y: boundary.points[bn - 1] };
        const bDir = { x: bEnd.x - bStart.x, y: bEnd.y - bStart.y };
        const tn = target.points.length;
        const tStart = { x: target.points[0], y: target.points[1] };
        const tEnd = { x: target.points[tn - 2], y: target.points[tn - 1] };
        const tDir = { x: tEnd.x - tStart.x, y: tEnd.y - tStart.y };
        const X = lineIntersect(bStart, bDir, tStart, tDir);
        if (!X) {
          setError('Grensen og målet er parallelle – kan ikke trimme/forlenge dit.');
          return; // grensen forblir armert – prøv et annet mål
        }
        const tX = paramAlongSegment(tStart, tEnd, X);
        beginHistoryBatch();
        try {
          if (tX > 0 && tX < 1) {
            // TRIM: grensen krysser målet MELLOM endepunktene – halvdelen med
            // klikkpunktet (P, projisert på senterlinja av findNearestLine) forsvinner.
            const tP = paramAlongSegment(tStart, tEnd, { x: hit.x, y: hit.y });
            trimLineTo(target.id, tP < tX ? 'end' : 'start', X.x, X.y);
          } else {
            // FORLENG: skjæringen ligger UTENFOR målets egne to endepunkter – flytt
            // enden nærmest dit via moveLineVertex, som arver skjøt-/bend-håndtering.
            moveLineVertex(target.id, tX <= 0 ? 0 : tn - 2, X.x, X.y, {});
          }
        } finally {
          endHistoryBatch();
        }
        // Grensen forblir armert (AutoCAD/Revit-konvensjon) – flere segmenter kan
        // trimmes/forlenges mot samme grense uten å velge den på nytt.
        return;
      }
      if (isMeasureTool && measureType) {
        // Rektangulær arealmåling: klikk-flytt-klikk (hybrid med dra). Andre klikk fullfører.
        if (measureType === 'area' && areaMeasureMode === 'rect') {
          if (rectDraft) {
            const x0 = Math.min(rectDraft.x0, p.x);
            const x1 = Math.max(rectDraft.x0, p.x);
            const y0 = Math.min(rectDraft.y0, p.y);
            const y1 = Math.max(rectDraft.y0, p.y);
            setRectDraft(null);
            if (x1 - x0 > 4 && y1 - y0 > 4) addMeasurement('area', [x0, y0, x1, y0, x1, y1, x0, y1]);
          } else {
            setRectDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
          }
          return;
        }
        // Frihånds-areal / avstand: snap til nærmeste vektorpunkt, men hold Shift
        // for å låse segmentet til en rett strek (0/45/90°) fra forrige punkt.
        const hasPrev = measureDraftPoints.length >= 2;
        const prevX = hasPrev ? measureDraftPoints[measureDraftPoints.length - 2] : 0;
        const prevY = hasPrev ? measureDraftPoints[measureDraftPoints.length - 1] : 0;
        const snapped =
          e.evt.shiftKey && hasPrev ? snapFirstPoint({ x: prevX, y: prevY }, p) : (findMeasureSnapPoint(p) ?? p);
        // Lukk arealet hvis man klikker tilbake på startpunktet (samme snap-logikk som
        // ved hovring), i stedet for å legge til et (nesten) duplikat punkt.
        if (measureType === 'area' && snapped.x === measureDraftPoints[0] && snapped.y === measureDraftPoints[1] && measureDraftPoints.length >= 6) {
          addMeasurement('area', measureDraftPoints);
          setMeasureDraftPoints([]);
          return;
        }
        const next = [...measureDraftPoints, snapped.x, snapped.y];
        if (measureType === 'distance' && next.length >= 4) {
          addMeasurement('distance', next);
          setMeasureDraftPoints([]);
        } else {
          setMeasureDraftPoints(next);
        }
        return;
      }
      if (tool === 'calibrate') {
        const next = [...calibPoints, p.x, p.y];
        if (next.length >= 4) {
          const px = distance(next[0], next[1], next[2], next[3]);
          setCalibrationDistance(px);
          setCalibPoints([]);
        } else {
          setCalibPoints(next);
        }
        return;
      }
      // select / pan: klikk i tomt område starter et gummibånd-utvalg (avsluttes i mouseup;
      // et reint klikk uten drag tolkes der som "fjern utvalg", som tidligere)
      if (clickedEmpty && tool === 'select') {
        setRubberBand({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      }
    },
    [
      getImagePoint,
      isLineTool,
      computeLinePoint,
      draftPoints,
      activeSubId,
      findBranchTarget,
      seedContinuation,
      insertBranchForTarget,
      draftDimension,
      activeSub,
      isAnnotationTool,
      annotationType,
      addAnnotation,
      polygonDraftPoints,
      cloudDraft,
      boxDraft,
      lineDraft,
      rectDraft,
      isSymbolTool,
      tool,
      lines,
      currentPage,
      scale.metersPerPixel,
      invScale,
      placeSymbolWithGuard,
      draftSystemId,
      calibPoints,
      setCalibrationDistance,
      clearSelection,
      addTag,
      isMeasureTool,
      measureType,
      measureDraftPoints,
      addMeasurement,
      findMeasureSnapPoint,
      areaMeasureMode,
      isTransformTool,
      transformBase,
      commitTransform,
      splitLineAt,
      trimBoundaryId,
      trimLineTo,
      moveLineVertex,
      beginHistoryBatch,
      endHistoryBatch,
      setError,
    ],
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (rubberBand) {
        const p = getImagePoint();
        if (p) setRubberBand((rb) => (rb ? { ...rb, x1: p.x, y1: p.y } : rb));
        return;
      }
      if (cloudDraft) {
        const p = getImagePoint();
        if (p) setCloudDraft((cd) => (cd ? { ...cd, x1: p.x, y1: p.y } : cd));
        return;
      }
      if (rectDraft) {
        const p = getImagePoint();
        if (p) setRectDraft((rd) => (rd ? { ...rd, x1: p.x, y1: p.y } : rd));
        return;
      }
      if (boxDraft) {
        const p = getImagePoint();
        if (p) setBoxDraft((bd) => (bd ? { ...bd, x1: p.x, y1: p.y } : bd));
        return;
      }
      if (lineDraft) {
        const p = getImagePoint();
        if (p) setLineDraft((ld) => (ld ? { ...ld, x1: p.x, y1: p.y } : ld));
        return;
      }
      if (
        !isLineTool &&
        !isSymbolTool &&
        tool !== 'calibrate' &&
        tool !== 'split' &&
        !isMeasureTool &&
        !isTransformTool &&
        annotationType !== 'polygon'
      ) {
        setHoverSnap((h) => (h ? null : h));
        return;
      }
      const p = getImagePoint();
      if (!p) return;
      if (annotationType === 'polygon') {
        // Levende forhåndsvisning av neste segment til lukking (se render lenger ned).
        setCursor(p);
        return;
      }
      if (isMeasureTool) {
        if (measureType === 'area' && areaMeasureMode === 'rect') {
          // Rektangelmodus bruker klikk-og-dra; ingen punkt-snap-indikator, men vi
          // holder `cursor` oppdatert slik at siktet fortsatt følger pekeren.
          setCursor(p);
          setMeasureSnapKind(null);
        } else if (e.evt.shiftKey && measureDraftPoints.length >= 2) {
          // Shift låser forhåndsvisningen til en rett strek fra forrige punkt.
          const prevX = measureDraftPoints[measureDraftPoints.length - 2];
          const prevY = measureDraftPoints[measureDraftPoints.length - 1];
          setCursor(snapFirstPoint({ x: prevX, y: prevY }, p));
          setMeasureSnapKind(null);
        } else {
          const snap = findMeasureSnapPoint(p);
          setCursor(snap ?? p);
          setMeasureSnapKind(snap?.kind ?? null);
        }
      } else if (isLineTool || tool === 'calibrate') {
        setCursor(isLineTool ? computeLinePoint(p, e.evt.shiftKey) : p);
      } else if (isTransformTool) {
        // Samme snap-regler som ved klikk: Shift låser retningen (kun når basispunktet
        // er satt – ellers er det ingen retning å låse til ennå), ellers nærmeste
        // vektorpunkt. Behold også snap-`kind` (samme state som måleverktøyene bruker)
        // slik at snap-badgen («Endepunkt»/«På linje») vises her også.
        if (transformBase && e.evt.shiftKey) {
          setCursor(snapFirstPoint(transformBase, p));
          setMeasureSnapKind(null);
        } else {
          const snap = findMeasureSnapPoint(p);
          setCursor(snap ?? p);
          setMeasureSnapKind(snap?.kind ?? null);
        }
      }

      // Forhåndsvis hva et klikk nå ville gjort: fortsette et eksisterende rør/kanal,
      // sette inn en avgreining, eller montere utstyr – samme treff-logikk som ved klikk.
      if (isLineTool && activeSubId) {
        // Vises nå gjennom hele strekningen, ikke bare før første punkt – siden et
        // klikk kan sette inn en avgreining midt i tegningen også (se mousedown over).
        const kind = categoryOf(activeSubId)?.kind;
        const target = kind ? findBranchTarget(p, kind) : null;
        if (target) {
          const branchDim = draftDimension ?? activeSub?.dimensions[0] ?? '';
          const tol = lineHitTolerance(target.line.dimension, scale.metersPerPixel, invScale);
          const endpointHit = endpointHitOf(target.line, target.x, target.y, tol);
          const shapeMismatch = isRectDim(target.line.dimension) !== isRectDim(branchDim);
          const isValidContinue =
            draftPoints.length === 0 && !!endpointHit && target.line.subId === activeSubId && !shapeMismatch;
          if (isValidContinue) {
            setHoverSnap({ line: target.line, x: target.x, y: target.y, kind: 'continue' });
          } else if (endpointHit) {
            // Endepunkt-mot-endepunkt (men ugyldig fortsettelse) blir en vanlig
            // skjøt/bend uten fitting satt inn – ingenting spesielt å varsle om.
            setHoverSnap(null);
          } else {
            setHoverSnap({ line: target.line, x: target.x, y: target.y, kind: 'branch' });
          }
        } else {
          setHoverSnap(null);
        }
      } else if (isSymbolTool) {
        let best: { line: LineEntity; x: number; y: number; distance: number } | null = null;
        for (const line of lines) {
          if (line.page !== currentPage) continue;
          const cp = closestPointOnPolyline(line.points, p);
          if (!cp) continue;
          const tol = lineHitTolerance(line.dimension, scale.metersPerPixel, invScale);
          if (cp.distance <= tol && (!best || cp.distance < best.distance)) {
            best = { line, x: cp.x, y: cp.y, distance: cp.distance };
          }
        }
        setHoverSnap(best ? { line: best.line, x: best.x, y: best.y, kind: 'mount' } : null);
      } else if (tool === 'split') {
        let best: { line: LineEntity; x: number; y: number; distance: number } | null = null;
        for (const line of lines) {
          if (line.page !== currentPage) continue;
          const cp = closestPointOnPolyline(line.points, p);
          if (!cp) continue;
          const tol = lineHitTolerance(line.dimension, scale.metersPerPixel, invScale);
          if (cp.distance <= tol && (!best || cp.distance < best.distance)) {
            best = { line, x: cp.x, y: cp.y, distance: cp.distance };
          }
        }
        setHoverSnap(best ? { line: best.line, x: best.x, y: best.y, kind: 'split' } : null);
      } else if (tool === 'trimextend') {
        const candidate = findNearestLine(
          lines.filter((l) => l.page === currentPage && l.id !== trimBoundaryId),
          p,
          scale.metersPerPixel,
          invScale,
        );
        if (!candidate) {
          setHoverSnap(null);
        } else if (!trimBoundaryId) {
          setHoverSnap({ line: candidate.line, x: candidate.x, y: candidate.y, kind: 'trim-boundary' });
        } else {
          const boundary = lines.find((l) => l.id === trimBoundaryId && l.page === currentPage);
          const target = candidate.line;
          const bn = boundary?.points.length ?? 0;
          const tn = target.points.length;
          const X = boundary
            ? lineIntersect(
                { x: boundary.points[0], y: boundary.points[1] },
                { x: boundary.points[bn - 2] - boundary.points[0], y: boundary.points[bn - 1] - boundary.points[1] },
                { x: target.points[0], y: target.points[1] },
                { x: target.points[tn - 2] - target.points[0], y: target.points[tn - 1] - target.points[1] },
              )
            : null;
          if (!X) {
            setHoverSnap(null);
          } else {
            const tX = paramAlongSegment(
              { x: target.points[0], y: target.points[1] },
              { x: target.points[tn - 2], y: target.points[tn - 1] },
              X,
            );
            setHoverSnap({ line: target, x: X.x, y: X.y, kind: tX > 0 && tX < 1 ? 'trim' : 'extend' });
          }
        }
      } else {
        setHoverSnap(null);
      }
    },
    [
      rubberBand,
      cloudDraft,
      rectDraft,
      boxDraft,
      lineDraft,
      annotationType,
      isLineTool,
      isSymbolTool,
      isMeasureTool,
      measureType,
      measureDraftPoints,
      areaMeasureMode,
      tool,
      getImagePoint,
      computeLinePoint,
      draftPoints,
      activeSubId,
      findBranchTarget,
      findMeasureSnapPoint,
      scale.metersPerPixel,
      invScale,
      lines,
      currentPage,
      isTransformTool,
      transformBase,
      trimBoundaryId,
    ],
  );

  const handleStageMouseUp = useCallback(() => {
    // For markup-/areal-draftene støtter vi BÅDE dra-og-slipp og klikk-flytt-klikk:
    // på mouseup committer vi kun hvis pekeren ble dratt (flyttet mer enn terskelen
    // siden startklikket). Ved et rent klikk lar vi draften leve videre – den fullføres
    // da av det neste klikket (håndtert i handleStageMouseDown).
    const dragThreshold = 6 * invScale;
    if (cloudDraft) {
      const moved = distance(cloudDraft.x0, cloudDraft.y0, cloudDraft.x1, cloudDraft.y1) > dragThreshold;
      if (moved) {
        const x0 = Math.min(cloudDraft.x0, cloudDraft.x1);
        const y0 = Math.min(cloudDraft.y0, cloudDraft.y1);
        const w = Math.abs(cloudDraft.x1 - cloudDraft.x0);
        const h = Math.abs(cloudDraft.y1 - cloudDraft.y0);
        setCloudDraft(null);
        if (w > 8 && h > 8) addAnnotation('cloud', x0, y0, { width: w, height: h });
      }
      return;
    }
    if (boxDraft && annotationType) {
      const moved = distance(boxDraft.x0, boxDraft.y0, boxDraft.x1, boxDraft.y1) > dragThreshold;
      if (moved) {
        const x0 = Math.min(boxDraft.x0, boxDraft.x1);
        const y0 = Math.min(boxDraft.y0, boxDraft.y1);
        const w = Math.abs(boxDraft.x1 - boxDraft.x0);
        const h = Math.abs(boxDraft.y1 - boxDraft.y0);
        setBoxDraft(null);
        if (w > 8 && h > 8) addAnnotation(annotationType, x0, y0, { width: w, height: h });
      }
      return;
    }
    if (lineDraft && annotationType) {
      const { x0, y0, x1, y1 } = lineDraft;
      if (distance(x0, y0, x1, y1) > dragThreshold) {
        setLineDraft(null);
        if (distance(x0, y0, x1, y1) > 8) addAnnotation(annotationType, 0, 0, { points: [x0, y0, x1, y1] });
      }
      return;
    }
    if (rectDraft) {
      const moved = distance(rectDraft.x0, rectDraft.y0, rectDraft.x1, rectDraft.y1) > dragThreshold;
      if (moved) {
        // Rektangulær arealmåling committes som et lukket 4-hjørne-polygon.
        const x0 = Math.min(rectDraft.x0, rectDraft.x1);
        const x1 = Math.max(rectDraft.x0, rectDraft.x1);
        const y0 = Math.min(rectDraft.y0, rectDraft.y1);
        const y1 = Math.max(rectDraft.y0, rectDraft.y1);
        setRectDraft(null);
        if (x1 - x0 > 4 && y1 - y0 > 4) addMeasurement('area', [x0, y0, x1, y0, x1, y1, x0, y1]);
      }
      return;
    }
    if (!rubberBand) return;
    const x0 = Math.min(rubberBand.x0, rubberBand.x1);
    const x1 = Math.max(rubberBand.x0, rubberBand.x1);
    const y0 = Math.min(rubberBand.y0, rubberBand.y1);
    const y1 = Math.max(rubberBand.y0, rubberBand.y1);
    setRubberBand(null);

    // Et reint klikk uten drag (rektangelet er forsvinnende lite) → fjern utvalg, som før
    if (x1 - x0 < 4 && y1 - y0 < 4) {
      clearSelection();
      clearMultiSelection();
      return;
    }

    const lineHits = lines.filter((line) => {
      if (line.page !== currentPage) return false;
      if (hiddenCategories.has(categoryOf(line.subId)?.code ?? '')) return false;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i + 1 < line.points.length; i += 2) {
        minX = Math.min(minX, line.points[i]);
        maxX = Math.max(maxX, line.points[i]);
        minY = Math.min(minY, line.points[i + 1]);
        maxY = Math.max(maxY, line.points[i + 1]);
      }
      return minX <= x1 && maxX >= x0 && minY <= y1 && maxY >= y0;
    });
    // Utstyr og annotasjoner er punkt-/boks-entiteter – tas med i samme rammevalg
    // slik at man kan slette/flytte flere ulike typer objekter i én operasjon.
    const symbolHits = symbols.filter(
      (sy) => sy.page === currentPage && sy.x >= x0 && sy.x <= x1 && sy.y >= y0 && sy.y <= y1,
    );
    const annotationHits = annotations.filter((a) => {
      if (a.page !== currentPage) return false;
      if (a.points && a.points.length >= 2) {
        // Punkt-baserte former (linje/pil/polygon) – bbox over punktene, samme mønster
        // som measurementHits under.
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i + 1 < a.points.length; i += 2) {
          minX = Math.min(minX, a.points[i]);
          maxX = Math.max(maxX, a.points[i]);
          minY = Math.min(minY, a.points[i + 1]);
          maxY = Math.max(maxY, a.points[i + 1]);
        }
        return minX <= x1 && maxX >= x0 && minY <= y1 && maxY >= y0;
      }
      const aw = a.width ?? 0;
      const ah = a.height ?? 0;
      return a.x <= x1 && a.x + aw >= x0 && a.y <= y1 && a.y + ah >= y0;
    });
    // Automatisk genererte deler (bend/avgreining/overgang) er også punkt-entiteter på
    // lerretet – tas med i rammevalget slik at de blir slettet sammen med kanalene/rørene
    // man drar over, i stedet for at man må slette dem manuelt etterpå.
    const branchHits = branches.filter(
      (b) => b.page === currentPage && b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1,
    );
    const transitionHits = transitions.filter(
      (t) => t.page === currentPage && t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1,
    );
    const bendHits = bends.filter(
      (b) => b.page === currentPage && b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1,
    );
    const tagHits = tags.filter(
      (t) => t.page === currentPage && t.labelX >= x0 && t.labelX <= x1 && t.labelY >= y0 && t.labelY <= y1,
    );
    const clampHits = clamps.filter(
      (c) => c.page === currentPage && c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1,
    );
    const measurementHits = measurements.filter((m) => {
      if (m.page !== currentPage) return false;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i + 1 < m.points.length; i += 2) {
        minX = Math.min(minX, m.points[i]);
        maxX = Math.max(maxX, m.points[i]);
        minY = Math.min(minY, m.points[i + 1]);
        maxY = Math.max(maxY, m.points[i + 1]);
      }
      return minX <= x1 && maxX >= x0 && minY <= y1 && maxY >= y0;
    });
    clearSelection();
    setMultiSelection([
      ...lineHits.map((l) => l.id),
      ...symbolHits.map((s) => s.id),
      ...annotationHits.map((a) => a.id),
      ...branchHits.map((b) => b.id),
      ...transitionHits.map((t) => t.id),
      ...bendHits.map((b) => b.id),
      ...tagHits.map((t) => t.id),
      ...clampHits.map((c) => c.id),
      ...measurementHits.map((m) => m.id),
    ]);
  }, [
    rubberBand,
    cloudDraft,
    boxDraft,
    lineDraft,
    annotationType,
    rectDraft,
    invScale,
    addAnnotation,
    addMeasurement,
    lines,
    symbols,
    annotations,
    branches,
    transitions,
    bends,
    tags,
    clamps,
    measurements,
    currentPage,
    hiddenCategories,
    clearSelection,
    clearMultiSelection,
    setMultiSelection,
  ]);

  const handleDblClick = useCallback(() => {
    if (isLineTool) finishLine();
  }, [isLineTool, finishLine]);

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const oldScale = view.scale;
      const mousePoint = {
        x: (pointer.x - view.x) / oldScale,
        y: (pointer.y - view.y) / oldScale,
      };
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const factor = 1.12;
      const newScale = clampScale(direction > 0 ? oldScale * factor : oldScale / factor);
      setView({
        scale: newScale,
        x: pointer.x - mousePoint.x * newScale,
        y: pointer.y - mousePoint.y * newScale,
      });
    },
    [view, setView],
  );

  const handleStageDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      if (e.target !== stageRef.current) return;
      setView({ ...view, x: e.target.x(), y: e.target.y() });
    },
    [view, setView],
  );

  // Høyreklikk på et tegnet rør/kanal setter inn et klammer der (uavhengig av
  // «auto-klammer»-innstillingen). Bruker gjeldende standard gjengestag-diameter/lengde.
  const handleContextMenu = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      e.evt.preventDefault();
      // Høyreklikk mens man tegner avslutter strekningen på stedet (Revit-stil).
      if (isLineTool) {
        if (draftPoints.length >= 4) finishLine();
        else {
          setDraftPoints([]);
          setContinuationAnchor(null);
          setCursor(null);
        }
        return;
      }
      // tool !== 'select': ingenting å gjøre her (andre verktøy har egne
      // høyreklikk-regler, eller ingen). tool === 'select' på TOMT lerret: LineNode sin
      // egen onContextMenu (kroppen) har allerede satt cancelBubble hvis klikket traff
      // en linje – når vi når hit har brukeren altså truffet tomt rom, og
      // kontekstmenyen (fire valg: avgrening/klammer/flytt/slett) åpnes derfor kun ved
      // å treffe selve røret/kanalen, ikke «nær nok» som den gamle klammer-gesten gjorde.
    },
    [isLineTool, draftPoints, finishLine],
  );

  // Egen farge på det Konva-tegnede siktet (og på dets snap-badge) per verktøy –
  // samme palett som spøkelses-forhåndsvisningen ved Flytt/Kopier bruker.
  const crosshairColor = tool === 'copy' ? '#4c9aff' : isTransformTool ? '#14c08a' : '#7c4dff';

  const cursorStyle =
    isPan || isSpacePan
      ? 'grab'
      : isTransformTool
        // Flytt/Kopier har nå sitt eget Konva-tegnede sikte – ikke vis OGSÅ den
        // native move/copy-musepekeren i tillegg, det ga to markører oppå hverandre.
        ? 'none'
        : isLineTool ||
            isSymbolTool ||
            isAnnotationTool ||
            isMeasureTool ||
            tool === 'calibrate' ||
            tool === 'split' ||
            tool === 'trimextend'
          ? 'crosshair'
          : 'default';

  // Forhåndsvisning av pågående linje (med levende segment til peker)
  const draftPreview =
    isLineTool && draftPoints.length > 0
      ? cursor
        ? [...draftPoints, cursor.x, cursor.y]
        : draftPoints
      : [];
  const draftColor = activeSub?.color ?? '#111';
  const draftLengthPx = draftPreview.length >= 4 ? polylineLength(draftPreview) : 0;
  const draftAngleDeg = draftPreview.length >= 4 ? segmentAngleDeg(draftPreview) : null;
  const draftBends = draftPreview.length >= 6 ? polylineBendAngles(draftPreview) : [];

  const calibPreview =
    tool === 'calibrate' && calibPoints.length > 0
      ? cursor
        ? [...calibPoints, cursor.x, cursor.y]
        : calibPoints
      : [];

  // Lag/synlighet: en kategori (f.eks. "31") kan skrus av fra lerretet via Toolbar.
  // Dette er rent en visningsfilter for canvas – mengdelisten er uberørt.
  const isSubHidden = (subId: string) => hiddenCategories.has(categoryOf(subId)?.code ?? '');
  const visibleLines = lines.filter((l) => l.page === currentPage && !isSubHidden(l.subId));
  // Pluss-håndtaket på åpne ender må traversere ALLE sidens linjer (ikke visibleLines)
  // – ellers ville det å skjule en underkategori fått skjøtene til den til å se åpne ut.
  const selectedOpenEnds = useMemo(() => {
    if (selectedKind !== 'line' || !selectedId) return null;
    const pageLines = lines.filter((l) => l.page === currentPage);
    const pageBranches = branches.filter((b) => b.page === currentPage);
    return openEndsOf(pageLines, selectedId, pageBranches);
  }, [selectedKind, selectedId, lines, branches, currentPage]);
  // Knekkpunkt-håndtakene (vertex-drag, C5a) og bend-/overgangs-/avgreiningsmarkørene
  // sitter alltid i NØYAKTIG samme punkt (en bend/overgang ER en delt linje-endepunkt,
  // og en avgreinings-arms endepunkt ER selve avgreiningspunktet) – markørene rendres
  // etter linjene og ville derfor alltid vunnet klikket, slik at man aldri fikk tak i
  // håndtaket for å dra det. Gjør markøren midlertidig ikke-interaktiv akkurat der den
  // merkede linjas eget endepunkt er, så håndtaket blir klikkbart; markøren er fortsatt
  // klikkbar fra alle andre tilstander (annen/ingen linje merket).
  const selectedLineEndpoints =
    selectedKind === 'line'
      ? (() => {
          const l = lines.find((x) => x.id === selectedId);
          if (!l) return [];
          const n = l.points.length;
          return [
            { x: l.points[0], y: l.points[1] },
            { x: l.points[n - 2], y: l.points[n - 1] },
          ];
        })()
      : [];
  const sitsAtSelectedVertex = (x: number, y: number) =>
    selectedLineEndpoints.some((p) => sharesPoint(p.x, p.y, x, y));
  // Konva sin trefftest følger rendre-rekkefølgen: en linje som er tegnet ETTER en
  // annen (høyere indeks i `lines`) ligger alltid OVENPÅ den forrige der de deler et
  // endepunkt – deres hit-linjer er langt bredere enn de 6px vertex-håndtakene, så det
  // ville i praksis vært umulig å dra et skjøtepunkt der man tilfeldigvis hadde merket
  // den EARLIER-tegnede av de to linjene. Fix: den merkede linja rendres alltid SIST
  // (uten å endre selve `lines`-arrayet – kun rekkefølgen for DENNE rendringen), slik
  // at dens vertex-håndtak alltid vinner over en nabolinjes kropp, uansett tegnerekkefølge.
  const renderLines =
    selectedKind === 'line' && selectedId && visibleLines.some((l) => l.id === selectedId)
      ? [...visibleLines.filter((l) => l.id !== selectedId), ...visibleLines.filter((l) => l.id === selectedId)]
      : visibleLines;
  // Dobbeltklikk på en linje merker HELE den sammenhengende strekningen (valg 5).
  // Traverserer alle sidens linjer (skjulte inkludert – en skjult nabo skal fortsatt
  // telle som del av strekningen topologisk), men resultatet filtreres til synlige
  // linjer før det settes som utvalg, slik at et skjult system aldri masse-merkes.
  const selectConnectedRun = useCallback(
    (lineId: string) => {
      const pageLines = lines.filter((l) => l.page === currentPage);
      const ids = Array.from(findConnectedLineIds(pageLines, [lineId])).filter(
        (id) => !isSubHidden(lines.find((l) => l.id === id)?.subId ?? ''),
      );
      clearSelection();
      setMultiSelection(ids);
    },
    [lines, currentPage, hiddenCategories, clearSelection, setMultiSelection],
  );
  // Kanalstrekninger (kun kanaler, ikke rør) gruppert til sammenhengende «runs» for
  // veggtegning – se buildDuctRunWalls. Rendres i ett stykke per strekning slik at
  // veggene blir sammenhengende (avrundet bend, innsnevret overgang), i stedet for at
  // hvert 2-punkts segment tegnes uavhengig med butte endepunkter.
  const ductRuns = groupDuctRuns(visibleLines.filter((l) => isDuctSub(l.subId)));
  const hiddenLineIds = new Set(
    lines.filter((l) => isSubHidden(l.subId)).map((l) => l.id),
  );
  const pageTransitions = transitions.filter((t) => t.page === currentPage && !isSubHidden(t.subId));
  const pageBranches = branches.filter((b) => b.page === currentPage && !isSubHidden(b.subId));
  const pageBends = bends.filter((b) => b.page === currentPage && !isSubHidden(b.subId));
  const visibleSymbols = symbols.filter(
    (sy) => sy.page === currentPage && !(sy.mountedLineId && hiddenLineIds.has(sy.mountedLineId)),
  );
  const hoveredSymbol = symbols.find((sy) => sy.id === hoveredSymbolId) ?? null;
  const pageAnnotations = annotations.filter((a) => a.page === currentPage);
  const editingAnnotation = annotations.find((a) => a.id === editingAnnotationId) ?? null;
  const pageTags = tags.filter((t) => t.page === currentPage && !isSubHidden(lines.find((l) => l.id === t.lineId)?.subId ?? ''));
  const pageClamps = clamps.filter((c) => c.page === currentPage && !isSubHidden(lines.find((l) => l.id === c.lineId)?.subId ?? ''));
  const pageMeasurements = measurements.filter((m) => m.page === currentPage);
  const measureDraftPreview =
    isMeasureTool && measureDraftPoints.length > 0
      ? cursor
        ? [...measureDraftPoints, cursor.x, cursor.y]
        : measureDraftPoints
      : [];

  // ── Flytt/Kopier: spøkelses-forhåndsvisning ────────────────────────────
  // Regner ut EKSAKT samme resultat som selve committen (applyMovePlan er en ren
  // funksjon brukt av begge), i stedet for en enkel Group-offset – nødvendig fordi
  // vinkelbevarende én-linje-flytting IKKE er en translasjon (naboer strekkes til et
  // skjæringspunkt). Hvilke entiteter som faktisk ble berørt oppdages generisk ved å
  // sammenligne referansene i patchen mot originalarrayene – applyMovePlan returnerer
  // samme objekt-referanse for alt som IKKE ble rørt.
  const movePreview = useMemo(() => {
    if (!isTransformTool || !transformBase || !cursor || !transformPlanRef.current) return null;
    const dx = cursor.x - transformBase.x;
    const dy = cursor.y - transformBase.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return null;
    const snapshot = {
      lines,
      symbols,
      transitions,
      branches,
      bends,
      annotations,
      tags,
      clamps,
      measurements,
      currentPage,
      scale,
      multiSelection,
      selectedId,
      selectedKind,
    };
    const patch = applyMovePlan(snapshot, transformPlanRef.current, dx, dy);
    const changed = <T,>(before: T[], after: T[]) => after.filter((e, i) => e !== before[i]);
    return {
      lines: changed(lines, patch.lines),
      symbols: changed(symbols, patch.symbols),
      bends: changed(bends, patch.bends),
      transitions: changed(transitions, patch.transitions),
      branches: changed(branches, patch.branches),
      tags: changed(tags, patch.tags),
      clamps: changed(clamps, patch.clamps),
      annotations: changed(annotations, patch.annotations),
      measurements: changed(measurements, patch.measurements),
    };
  }, [
    isTransformTool,
    transformBase,
    cursor,
    lines,
    symbols,
    transitions,
    branches,
    bends,
    annotations,
    tags,
    clamps,
    measurements,
    currentPage,
    scale,
    multiSelection,
    selectedId,
    selectedKind,
  ]);

  return (
    <div ref={containerRef} className="canvas-host" style={{ cursor: cursorStyle }}>
      {!pdfDoc && (
        <div className="canvas-empty">
          <div className="canvas-empty-card">
            <div className="canvas-empty-icon">
              <FileSearch size={26} />
            </div>
            <h2>Ingen tegning lastet</h2>
            <p>Last opp en PDF-tegning fra verktøylinjen øverst for å starte mengdeuttaket.</p>
          </div>
        </div>
      )}

      {isLineTool && activeSub && (
        <div className="draw-hud">
          <span className="draw-hud-label">{activeSub.label}</span>
          <span className="draw-hud-sep">·</span>
          <span className="draw-hud-material">{activeMaterial}</span>
          <select
            className="draw-hud-select"
            value={draftDimension ?? ''}
            onChange={(e) => changeDraftDimension(e.target.value)}
            title="Bytt dimensjon (legger til en synlig overgang hvis du allerede har tegnet)"
          >
            {dimensionsForMaterial(activeSub, activeMaterial, customDimensions).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          {customSystems.length > 0 && (
            <select
              className="draw-hud-select"
              value={draftSystemId}
              onChange={(e) => setDraftSystemId(e.target.value)}
              title="Velg system (valgfritt, definert i Innstillinger)"
            >
              <option value="">Ingen system</option>
              {customSystems.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          )}
          <span
            className={`draw-hud-lock ${shiftHeld ? 'released' : ''}`}
            title={
              shiftHeld
                ? 'Vinkellås er løst ut mens Shift holdes – tegner fritt'
                : `Vinkellås er på – rett vinkel og ${activeBendAngles.map((a) => `${a}°`).join(', ')}. Hold Shift for å tegne fritt.`
            }
          >
            {shiftHeld ? 'Fri vinkel' : `Låst · ${activeBendAngles.join('/')}°`}
          </span>
          {!scale.metersPerPixel && (
            <button
              className="draw-hud-scale-warn"
              onClick={() => openScaleDialog('manual')}
              title="Ingen målestokk satt – nødvendig for eksakt lengde og fysiske mål"
            >
              Sett målestokk
            </button>
          )}
        </div>
      )}

      {measureType === 'area' && (
        <div className="draw-hud">
          <span className="draw-hud-label">Areal</span>
          <span className="draw-hud-sep">·</span>
          <button
            className={`draw-hud-toggle ${areaMeasureMode === 'free' ? 'active' : ''}`}
            onClick={() => {
              setAreaMeasureMode('free');
              setRectDraft(null);
              setMeasureDraftPoints([]);
            }}
            title="Tegn arealet fritt punkt for punkt"
          >
            Frihånd
          </button>
          <button
            className={`draw-hud-toggle ${areaMeasureMode === 'rect' ? 'active' : ''}`}
            onClick={() => {
              setAreaMeasureMode('rect');
              setRectDraft(null);
              setMeasureDraftPoints([]);
            }}
            title="Dra opp et rektangel (klikk og dra)"
          >
            Rektangel
          </button>
        </div>
      )}

      {isSymbolTool && (() => {
        const symType = tool.slice('symbol:'.length) as SymbolEntity['type'];
        const def = symbolDefFor(symType, customComponents);
        if (!def) return null;
        const cfg = symbolConfig[symType] ?? {};
        return (
          <div className="draw-hud symbol-hud">
            <span className="draw-hud-label">{def.label}</span>
            {def.fields.map((f) => (
              <label key={f.key} className="symbol-hud-field" title={`${f.label}${f.unit ? ` (${f.unit})` : ''} for neste plassering`}>
                <span>{f.label}</span>
                {f.kind === 'select' ? (
                  <>
                    <select
                      className="draw-hud-select"
                      value={String(cfg[f.key] ?? f.default)}
                      onChange={(e) => setSymbolConfig(symType, { [f.key]: e.target.value })}
                    >
                      {mergedOptions(symType, f.options ?? [], customDimensions).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                    {f.customizable &&
                      (customFieldInput?.key === `${symType}:${f.key}` ? (
                        <input
                          className="symbol-hud-input symbol-hud-custom-input"
                          autoFocus
                          placeholder="Egendefinert"
                          value={customFieldInput.value}
                          onChange={(e) => setCustomFieldInput({ key: `${symType}:${f.key}`, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const v = customFieldInput.value.trim();
                              if (v) {
                                addCustomDimension(symType, v);
                                setSymbolConfig(symType, { [f.key]: v });
                              }
                              setCustomFieldInput(null);
                            } else if (e.key === 'Escape') {
                              setCustomFieldInput(null);
                            }
                          }}
                          onBlur={() => setCustomFieldInput(null)}
                        />
                      ) : (
                        <button
                          type="button"
                          className="btn icon symbol-hud-add-btn"
                          title="Legg til egendefinert verdi"
                          onClick={() => setCustomFieldInput({ key: `${symType}:${f.key}`, value: '' })}
                        >
                          <Plus size={12} />
                        </button>
                      ))}
                  </>
                ) : (
                  <input
                    className="symbol-hud-input"
                    type={f.kind === 'number' ? 'number' : 'text'}
                    value={String(cfg[f.key] ?? f.default)}
                    onChange={(e) =>
                      setSymbolConfig(symType, {
                        [f.key]: f.kind === 'number' ? Number(e.target.value) : e.target.value,
                      })
                    }
                  />
                )}
              </label>
            ))}
            {customSystems.length > 0 && (
              <select
                className="draw-hud-select"
                value={draftSystemId}
                onChange={(e) => setDraftSystemId(e.target.value)}
                title="Velg system (valgfritt, definert i Innstillinger)"
              >
                <option value="">Ingen system</option>
                {customSystems.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })()}

      {isAnnotationTool && annotationType && (
        <div className="draw-hud annotation-hud">
          <span className="draw-hud-label">{annotationTypeLabel(annotationType)}</span>
          <label className="annotation-hud-color">
            <input
              type="color"
              value={annotationConfig[annotationType].color}
              onChange={(e) => setAnnotationConfig(annotationType, { color: e.target.value })}
              title="Farge"
            />
          </label>
          {TEXT_ANNOTATION_TYPES.has(annotationType) ? (
            <label className="annotation-hud-number">
              <span>Skriftstørrelse</span>
              <input
                type="number"
                min={8}
                max={48}
                value={annotationConfig[annotationType].fontSize}
                onChange={(e) => setAnnotationConfig(annotationType, { fontSize: Number(e.target.value) })}
              />
            </label>
          ) : annotationType === 'highlight' ? (
            <label className="annotation-hud-number">
              <span>Styrke</span>
              <input
                type="range"
                min={0.1}
                max={0.8}
                step={0.05}
                value={annotationConfig.highlight.opacity}
                onChange={(e) => setAnnotationConfig('highlight', { opacity: Number(e.target.value) })}
              />
            </label>
          ) : (
            <label className="annotation-hud-number">
              <span>Tykkelse</span>
              <input
                type="number"
                min={1}
                max={20}
                value={annotationConfig[annotationType].strokeWidth}
                onChange={(e) => setAnnotationConfig(annotationType, { strokeWidth: Number(e.target.value) })}
              />
            </label>
          )}
        </div>
      )}

      {showShiftTip && !hideShiftTip && isLineTool && activeMaterial && (
        <div className="shift-tip">
          <Lightbulb size={15} className="shift-tip-icon" />
          <span className="shift-tip-text">
            <strong>Vinkellås er på</strong> – rette linjer og {activeMaterial}s standardvinkler
            ({activeBendAngles.map((a) => `${a}°`).join(', ')}). Hold <strong>Shift</strong> for å tegne fritt.
            Skriv et tall for eksakt lengde.
          </span>
          <button
            className="shift-tip-dismiss"
            onClick={() => {
              setHideShiftTip(true);
              setShowShiftTip(false);
            }}
          >
            Ikke vis igjen
          </button>
          <button className="shift-tip-close" onClick={() => setShowShiftTip(false)}>
            <X size={14} />
          </button>
        </div>
      )}

      {isLineTool && draftPreview.length >= 4 && (
        <div className="draw-status-bar">
          <span>
            Lengde: <strong>{formatLengthMm(draftLengthPx, scale.metersPerPixel)}</strong>
          </span>
          {draftAngleDeg != null && (
            <span>
              Vinkel: <strong>{Math.round(draftAngleDeg)}°</strong>
            </span>
          )}
          {draftDimension && (
            <span>
              Dimensjon: <strong>{draftDimension}</strong>
            </span>
          )}
          {activeMaterial && (
            <span>
              Materiale: <strong>{activeMaterial}</strong>
            </span>
          )}
        </div>
      )}

      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={view.scale}
        scaleY={view.scale}
        x={view.x}
        y={view.y}
        draggable={isPan || isSpacePan}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleStageMouseUp}
        onDblClick={handleDblClick}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
        onDragEnd={handleStageDragEnd}
      >
        {/* Bakgrunn: PDF-side */}
        <Layer listening={false}>
          {pageImage && <KonvaImage image={pageImage} width={pageWidth} height={pageHeight} />}
        </Layer>

        {/* Tegnelag: linjer + symboler */}
        <Layer>
          {ductRuns.map((run, i) => {
            const sub = SUBCATEGORIES[run[0].subId];
            const { vertices, dims } = flattenDuctRun(run);
            const halfWidths = dims.map(
              (d) => Math.max(mmToPx(dimensionDiameterMm(d), scale.metersPerPixel), 5 * invScale) / 2,
            );
            const walls = buildDuctRunWalls(vertices, halfWidths);
            return (
              <DuctRunSchematic
                key={run[0].id || i}
                walls={walls}
                color={colorFor(sub, customColors)}
                invScale={invScale}
              />
            );
          })}
          {renderLines
            .map((line) => (
              <LineNode
                key={line.id}
                line={line}
                selected={line.id === selectedId}
                multiSelected={multiSelection.has(line.id)}
                invScale={invScale}
                editable={tool === 'select'}
                onSelect={() => {
                  clearMultiSelection();
                  select(line.id, 'line');
                }}
                onToggleMultiSelect={() => toggleMultiSelect(line.id)}
                onMove={(dx, dy) => moveSingleLine(line.id, dx, dy, true)}
                onMoveVertex={(vertexIndex, x, y, detach) =>
                  moveLineVertex(line.id, vertexIndex, x, y, { detach })
                }
                onExtend={(fromStart) => seedContinuation(line, fromStart)}
                onOpenMenu={(point) =>
                  setCanvasMenu({
                    target: { type: 'lineBody', lineId: line.id, x: point.x, y: point.y, angleDeg: point.angleDeg },
                    x: point.x,
                    y: point.y,
                  })
                }
                openEnds={line.id === selectedId ? selectedOpenEnds : null}
                onOpenEndMenu={(fromStart, x, y) =>
                  setCanvasMenu({ target: { type: 'openEnd', lineId: line.id, fromStart, x, y }, x, y })
                }
                onSelectRun={() => selectConnectedRun(line.id)}
                metersPerPixel={scale.metersPerPixel}
                pipeRenderStyle={pipeRenderStyle}
                customColors={customColors}
                onVertexDragStart={beginHistoryBatch}
                onVertexDragEnd={endHistoryBatch}
              />
            ))}
          {visibleSymbols
            .map((sym) => (
              <SymbolNode
                key={sym.id}
                sym={sym}
                selected={sym.id === selectedId || multiSelection.has(sym.id)}
                nodeScale={symbolRenderScale(sym, lines, scale.metersPerPixel, invScale)}
                showAirflowArrows={showAirflowArrows}
                editable={tool === 'select'}
                invScale={invScale}
                hideLabel={hideComponentLabels}
                customComponents={customComponents}
                color={
                  sym.type === 'supply_diffuser'
                    ? colorFor(SUBCATEGORIES['36.tilluft'], customColors)
                    : sym.type === 'extract_diffuser'
                      ? colorFor(SUBCATEGORIES['36.avtrekk'], customColors)
                      : undefined
                }
                onSelect={() => select(sym.id, 'symbol')}
                onChange={(x, y) => updateSymbol(sym.id, { x, y })}
                onHover={(hovering) => setHoveredSymbol(hovering ? sym.id : null)}
              />
            ))}
          {pageTransitions.map((t) => (
            <TransitionMarker
              key={t.id}
              transition={t}
              invScale={invScale}
              selected={t.id === selectedId || multiSelection.has(t.id)}
              hideLabel={hideComponentLabels}
              interactive={tool === 'select' && !sitsAtSelectedVertex(t.x, t.y)}
              onSelect={() => select(t.id, 'transition')}
            />
          ))}
          {pageBranches.map((b) => (
            <BranchMarker
              key={b.id}
              branch={b}
              invScale={invScale}
              selected={b.id === selectedId || multiSelection.has(b.id)}
              hideLabel={hideComponentLabels}
              interactive={tool === 'select' && !sitsAtSelectedVertex(b.x, b.y)}
              onSelect={() => select(b.id, 'branch')}
              onEditType={() =>
                setPendingBranchChoice({
                  mainSubId: b.subId,
                  mainMaterial: b.material,
                  mainDimension: b.dimension,
                  branchDimension: b.branchDimension,
                  x: b.x,
                  y: b.y,
                  angleDeg: b.angleDeg,
                  editId: b.id,
                  currentFittingType: b.fittingType,
                })
              }
            />
          ))}
          {pageBends.map((b) => (
            <BendMarker
              key={b.id}
              bend={b}
              invScale={invScale}
              selected={b.id === selectedId || multiSelection.has(b.id)}
              interactive={tool === 'select' && !sitsAtSelectedVertex(b.x, b.y)}
              onSelect={() => select(b.id, 'bend')}
            />
          ))}
          {pageAnnotations.map((note) => (
            <AnnotationNode
              key={note.id}
              note={note}
              selected={note.id === selectedId || multiSelection.has(note.id)}
              invScale={invScale}
              editable={tool === 'select'}
              onSelect={() => select(note.id, 'annotation')}
              onChange={(patch) => updateAnnotation(note.id, patch)}
              onEditText={() => setEditingAnnotationId(note.id)}
            />
          ))}
          {pageTags.map((t) => {
            const line = lines.find((l) => l.id === t.lineId);
            if (!line) return null;
            const sub = SUBCATEGORIES[line.subId];
            return (
              <TagNode
                key={t.id}
                tag={t}
                text={tagLabel(line)}
                color={colorFor(sub, customColors)}
                selected={t.id === selectedId || multiSelection.has(t.id)}
                invScale={invScale}
                editable={tool === 'select'}
                onSelect={() => select(t.id, 'tag')}
                onChange={(labelX, labelY) => updateTagLabel(t.id, labelX, labelY)}
              />
            );
          })}
          {pageClamps.map((c) => (
            <ClampMarker
              key={c.id}
              clamp={c}
              invScale={invScale}
              selected={c.id === selectedId || multiSelection.has(c.id)}
              interactive={tool === 'select'}
              onSelect={() => select(c.id, 'clamp')}
              onChange={(x, y) => updateClampPosition(c.id, x, y)}
            />
          ))}
          {pageMeasurements.map((m) => (
            <MeasurementNode
              key={m.id}
              measurement={m}
              metersPerPixel={scale.metersPerPixel}
              selected={m.id === selectedId || multiSelection.has(m.id)}
              invScale={invScale}
              interactive={tool === 'select'}
              onSelect={() => select(m.id, 'measurement')}
            />
          ))}
        </Layer>

        {/* Overlegg: pågående tegning / kalibrering */}
        <Layer listening={false}>
          {measureDraftPreview.length >= 4 && measureType === 'distance' && (
            <Line points={measureDraftPreview} stroke="#7c4dff" strokeWidth={1.5 * invScale} dash={[6 * invScale, 4 * invScale]} />
          )}
          {measureDraftPreview.length >= 4 && measureType === 'area' && (
            <Line
              points={measureDraftPreview}
              stroke="#7c4dff"
              strokeWidth={1.5 * invScale}
              dash={[6 * invScale, 4 * invScale]}
              closed
              fill="rgba(124,77,255,0.08)"
            />
          )}
          {rectDraft && (
            <Rect
              x={Math.min(rectDraft.x0, rectDraft.x1)}
              y={Math.min(rectDraft.y0, rectDraft.y1)}
              width={Math.abs(rectDraft.x1 - rectDraft.x0)}
              height={Math.abs(rectDraft.y1 - rectDraft.y0)}
              stroke="#7c4dff"
              strokeWidth={1.5 * invScale}
              dash={[6 * invScale, 4 * invScale]}
              fill="rgba(124,77,255,0.08)"
            />
          )}
          {(isMeasureTool || isTransformTool) && cursor && (
            // Permanent sikte (trådkors) på pekeren i måleverktøyene OG i Flytt/Kopier
            // (brukeren ba spesifikt om samme sikte der), slik at man kan treffe
            // nøyaktig der man vil måle/flytte/kopiere fra – uavhengig av om man er
            // snappet til noe. Tegnes som to hårlinjer med en liten åpning midt i, pluss
            // et lite senterpunkt. Snap-indikatoren under tegnes oppå når man faktisk er
            // snappet. Fargen følger verktøyet – samme palett som spøkelses-
            // forhåndsvisningen ved Flytt/Kopier.
            <Group x={cursor.x} y={cursor.y} listening={false}>
              <Line
                points={[-14 * invScale, 0, -4 * invScale, 0]}
                stroke={crosshairColor}
                strokeWidth={1 * invScale}
              />
              <Line
                points={[4 * invScale, 0, 14 * invScale, 0]}
                stroke={crosshairColor}
                strokeWidth={1 * invScale}
              />
              <Line
                points={[0, -14 * invScale, 0, -4 * invScale]}
                stroke={crosshairColor}
                strokeWidth={1 * invScale}
              />
              <Line
                points={[0, 4 * invScale, 0, 14 * invScale]}
                stroke={crosshairColor}
                strokeWidth={1 * invScale}
              />
              <Circle radius={1.5 * invScale} fill={crosshairColor} />
            </Group>
          )}
          {(isMeasureTool || isTransformTool) && measureSnapKind && cursor && (
            <Group x={cursor.x} y={cursor.y}>
              <Circle
                radius={7 * invScale}
                stroke={measureSnapKind === 'close' ? '#14c08a' : crosshairColor}
                strokeWidth={1.5 * invScale}
                fill="#fff"
              />
              <Circle radius={2 * invScale} fill={measureSnapKind === 'close' ? '#14c08a' : crosshairColor} />
              <Text
                text={
                  measureSnapKind === 'endpoint'
                    ? 'Endepunkt'
                    : measureSnapKind === 'online'
                      ? 'På linje'
                      : measureSnapKind === 'symbol'
                        ? 'Utstyr'
                        : 'Lukk figur'
                }
                x={10 * invScale}
                y={-16 * invScale}
                fontSize={11 * invScale}
                fill={measureSnapKind === 'close' ? '#14c08a' : crosshairColor}
                fontStyle="bold"
              />
            </Group>
          )}
          {rubberBand && (
            <Rect
              x={Math.min(rubberBand.x0, rubberBand.x1)}
              y={Math.min(rubberBand.y0, rubberBand.y1)}
              width={Math.abs(rubberBand.x1 - rubberBand.x0)}
              height={Math.abs(rubberBand.y1 - rubberBand.y0)}
              fill="rgba(20,192,138,0.12)"
              stroke="#14c08a"
              strokeWidth={1 * invScale}
              dash={[5 * invScale, 4 * invScale]}
            />
          )}
          {cloudDraft && (
            <Rect
              x={Math.min(cloudDraft.x0, cloudDraft.x1)}
              y={Math.min(cloudDraft.y0, cloudDraft.y1)}
              width={Math.abs(cloudDraft.x1 - cloudDraft.x0)}
              height={Math.abs(cloudDraft.y1 - cloudDraft.y0)}
              stroke={annotationConfig.cloud.color}
              strokeWidth={1.5 * invScale}
              dash={[6 * invScale, 4 * invScale]}
            />
          )}
          {boxDraft && annotationType && (
            <Rect
              x={Math.min(boxDraft.x0, boxDraft.x1)}
              y={Math.min(boxDraft.y0, boxDraft.y1)}
              width={Math.abs(boxDraft.x1 - boxDraft.x0)}
              height={Math.abs(boxDraft.y1 - boxDraft.y0)}
              stroke={annotationConfig[annotationType].color}
              strokeWidth={1.5 * invScale}
              dash={[6 * invScale, 4 * invScale]}
            />
          )}
          {lineDraft && annotationType && (
            <Line
              points={[lineDraft.x0, lineDraft.y0, lineDraft.x1, lineDraft.y1]}
              stroke={annotationConfig[annotationType].color}
              strokeWidth={2 * invScale}
              dash={[6 * invScale, 4 * invScale]}
            />
          )}
          {annotationType === 'polygon' && polygonDraftPoints.length >= 2 && (
            <Line
              points={cursor ? [...polygonDraftPoints, cursor.x, cursor.y] : polygonDraftPoints}
              stroke={annotationConfig.polygon.color}
              strokeWidth={1.5 * invScale}
              dash={[6 * invScale, 4 * invScale]}
              closed={polygonDraftPoints.length >= 6}
            />
          )}
          {draftPreview.length >= 4 && activeSubId && (
            <Line
              points={draftPreview}
              stroke={draftColor}
              strokeWidth={3 * invScale}
              dash={[8 * invScale, 6 * invScale]}
              lineCap="round"
              lineJoin="round"
            />
          )}
          {draftBends.map((b, i) => (
            <BendBadge key={i} x={b.x} y={b.y} angleDeg={classifyBendAngle(b.angleDeg)} invScale={invScale} />
          ))}
          {isLineTool && draftPoints.length >= 2 && cursor && !lineEntry && (() => {
            const n = draftPoints.length;
            const px0 = draftPoints[n - 2];
            const py0 = draftPoints[n - 1];
            const segPx = distance(px0, py0, cursor.x, cursor.y);
            if (segPx < 4 * invScale) return null;
            // Turn-vinkelen for segmentet man er i ferd med å legge til er alltid den
            // SISTE i draftBends, siden draftPreview (som draftBends regnes fra)
            // slutter nettopp i cursor-punktet.
            const liveBend = draftBends.length > 0 ? draftBends[draftBends.length - 1] : null;
            return (
              <Group x={cursor.x} y={cursor.y} listening={false}>
                <Rect
                  x={12 * invScale}
                  y={4 * invScale}
                  width={94 * invScale}
                  height={(liveBend ? 32 : 18) * invScale}
                  fill="rgba(20,26,34,0.82)"
                  cornerRadius={4 * invScale}
                />
                <Text
                  x={16 * invScale}
                  y={7 * invScale}
                  text={formatLengthMm(segPx, scale.metersPerPixel)}
                  fontSize={12 * invScale}
                  fill="#fff"
                  fontStyle="bold"
                />
                {liveBend && (
                  <Text
                    x={16 * invScale}
                    y={21 * invScale}
                    text={`${classifyBendAngle(liveBend.angleDeg)}°`}
                    fontSize={11 * invScale}
                    fill="#f5a623"
                    fontStyle="bold"
                  />
                )}
              </Group>
            );
          })()}
          {trimBoundaryId &&
            (() => {
              const boundary = lines.find((l) => l.id === trimBoundaryId && l.page === currentPage);
              if (!boundary) return null;
              // Grensen holder seg oransje/aksent-farget SÅ LENGE den er armert – ikke
              // bare mens musepekeren akkurat nå henger over den – slik at man ser hvilken
              // linje man traff, gjennom flere påfølgende trim/forleng-klikk mot samme grense.
              return (
                <Line
                  points={boundary.points}
                  stroke="#f5a623"
                  strokeWidth={10 * invScale}
                  opacity={0.35}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                />
              );
            })()}
          {hoverSnap && (
            <>
              <Line
                points={hoverSnap.line.points}
                stroke="#14c08a"
                strokeWidth={10 * invScale}
                opacity={0.35}
                lineCap="round"
                lineJoin="round"
              />
              <Group x={hoverSnap.x} y={hoverSnap.y}>
                <Circle radius={6 * invScale} fill="#14c08a" opacity={0.9} />
                <Text
                  x={10 * invScale}
                  y={-18 * invScale}
                  text={
                    hoverSnap.kind === 'continue'
                      ? 'Fortsetter røret'
                      : hoverSnap.kind === 'branch'
                        ? 'Ny avgreining'
                        : hoverSnap.kind === 'split'
                          ? 'Del her'
                          : hoverSnap.kind === 'trim-boundary'
                            ? 'Velg som grense'
                            : hoverSnap.kind === 'trim'
                              ? 'Trim her'
                              : hoverSnap.kind === 'extend'
                                ? 'Forleng hit'
                                : 'Monteres på kanal'
                  }
                  fontSize={12 * invScale}
                  fill="#1f6fd1"
                  fontStyle="bold"
                />
              </Group>
            </>
          )}
          {calibPreview.length >= 4 && (
            <>
              <Line points={calibPreview} stroke="#f5a623" strokeWidth={2 * invScale} dash={[6 * invScale, 4 * invScale]} />
              <Text
                x={calibPreview[0]}
                y={calibPreview[1] - 18 * invScale}
                text="Kalibrering: klikk punkt 2"
                fontSize={12 * invScale}
                fill="#b8860b"
                fontStyle="bold"
              />
            </>
          )}
          {movePreview && transformBase && cursor && (
            <>
              {/* Gummistrek fra basispunkt til peker, med live avstand/vinkel – samme
                  visuelle språk som måleverktøyets forhåndsvisning. */}
              <Line
                points={[transformBase.x, transformBase.y, cursor.x, cursor.y]}
                stroke={tool === 'copy' ? '#4c9aff' : '#14c08a'}
                strokeWidth={1.5 * invScale}
                dash={[6 * invScale, 4 * invScale]}
              />
              <Circle x={transformBase.x} y={transformBase.y} radius={3 * invScale} fill={tool === 'copy' ? '#4c9aff' : '#14c08a'} />
              <Text
                x={cursor.x + 10 * invScale}
                y={cursor.y - 18 * invScale}
                text={formatLengthMm(distance(transformBase.x, transformBase.y, cursor.x, cursor.y), scale.metersPerPixel)}
                fontSize={12 * invScale}
                fill={tool === 'copy' ? '#4c9aff' : '#14c08a'}
                fontStyle="bold"
              />
              {movePreview.lines.map((l) => (
                <Line
                  key={l.id}
                  points={l.points}
                  stroke={tool === 'copy' ? '#4c9aff' : '#14c08a'}
                  strokeWidth={Math.max(mmToPx(dimensionDiameterMm(l.dimension), scale.metersPerPixel), 5 * invScale)}
                  opacity={0.45}
                  lineCap="round"
                  lineJoin="round"
                />
              ))}
              {[...movePreview.bends, ...movePreview.transitions, ...movePreview.branches, ...movePreview.clamps].map(
                (m) => (
                  <Circle
                    key={m.id}
                    x={m.x}
                    y={m.y}
                    radius={5 * invScale}
                    fill={tool === 'copy' ? '#4c9aff' : '#14c08a'}
                    opacity={0.55}
                  />
                ),
              )}
              {movePreview.tags.map((t) => (
                <Circle
                  key={t.id}
                  x={t.labelX}
                  y={t.labelY}
                  radius={5 * invScale}
                  fill={tool === 'copy' ? '#4c9aff' : '#14c08a'}
                  opacity={0.55}
                />
              ))}
              {movePreview.annotations.map((a) => (
                <Circle
                  key={a.id}
                  x={a.x}
                  y={a.y}
                  radius={6 * invScale}
                  fill={tool === 'copy' ? '#4c9aff' : '#14c08a'}
                  opacity={0.4}
                />
              ))}
              {movePreview.measurements.map((m) => (
                <Line
                  key={m.id}
                  points={m.points}
                  stroke={tool === 'copy' ? '#4c9aff' : '#14c08a'}
                  strokeWidth={2 * invScale}
                  opacity={0.5}
                  dash={[6 * invScale, 4 * invScale]}
                />
              ))}
            </>
          )}
        </Layer>
      </Stage>

      {hoveredSymbol && (
        <SymbolTooltip
          symbol={hoveredSymbol}
          screenX={hoveredSymbol.x * view.scale + view.x}
          screenY={hoveredSymbol.y * view.scale + view.y}
        />
      )}
      <BranchChoicePopover view={view} />
      <CanvasContextMenu view={view} onCommand={handleCanvasMenuCommand} />

      {distanceEntry && (
        <div className="move-distance-input" style={{ left: distanceEntry.screenX, top: distanceEntry.screenY }}>
          <input
            autoFocus
            inputMode="decimal"
            value={distanceEntry.value}
            onChange={(e) =>
              setDistanceEntry((d) => (d ? { ...d, value: e.target.value.replace(/[^0-9.,]/g, '') } : d))
            }
            onKeyDown={(e) => {
              // Stopp Enter/Escape/sifre fra å boble videre til lerretets egen
              // tastatur-håndtering (som ellers ville tolket dem som nye kommandoer).
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                commitNumericDistance();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setDistanceEntry(null);
              }
            }}
          />
          <span>mm</span>
        </div>
      )}

      {lineEntry && (
        <div className="move-distance-input line-entry" style={{ left: lineEntry.screenX, top: lineEntry.screenY }}>
          <input
            ref={lineEntryLengthRef}
            autoFocus={lineEntry.field === 'length'}
            className={lineEntry.field === 'length' ? 'focused' : undefined}
            inputMode="decimal"
            value={lineEntry.length}
            onChange={(e) =>
              setLineEntry((v) => (v ? { ...v, length: e.target.value.replace(/[^0-9.,]/g, '') } : v))
            }
            onKeyDown={(e) => {
              // Stopp alt fra å boble til lerretets tastatur-håndtering – det er dette
              // som samtidig gjør at bokstavsnarveiene (R/K/V/F/C/D/A) aldri kan trigge
              // mens man skriver her.
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                commitLineEntry();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setLineEntry(null);
              } else if (e.key === 'Tab') {
                e.preventDefault();
                setLineEntry((v) => (v ? { ...v, field: 'angle' } : v));
                lineEntryAngleRef.current?.focus();
              }
            }}
          />
          <span>mm</span>
          <input
            ref={lineEntryAngleRef}
            autoFocus={lineEntry.field === 'angle'}
            className={lineEntry.field === 'angle' ? 'focused' : undefined}
            inputMode="decimal"
            placeholder={draftPoints.length >= 4 || continuationAnchor ? 'Bend' : 'Retning'}
            value={lineEntry.angle}
            onChange={(e) =>
              setLineEntry((v) => (v ? { ...v, angle: e.target.value.replace(/[^0-9.,-]/g, '') } : v))
            }
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                commitLineEntry();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setLineEntry(null);
              } else if (e.key === 'Tab') {
                e.preventDefault();
                setLineEntry((v) => (v ? { ...v, field: 'length' } : v));
                lineEntryLengthRef.current?.focus();
              }
            }}
          />
          <span>°</span>
        </div>
      )}

      {editingAnnotation && (
        <textarea
          autoFocus
          className="annotation-text-editor"
          style={{
            left: editingAnnotation.x * view.scale + view.x,
            top: editingAnnotation.y * view.scale + view.y,
            fontSize: (editingAnnotation.fontSize ?? 14) * view.scale,
            color: editingAnnotation.color,
            width: editingAnnotation.width ? editingAnnotation.width * view.scale : undefined,
            height: editingAnnotation.height ? editingAnnotation.height * view.scale : undefined,
          }}
          defaultValue={editingAnnotation.text ?? ''}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => {
            updateAnnotation(editingAnnotation.id, { text: e.target.value });
            setEditingAnnotationId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      )}
    </div>
  );
}

/** Tegner én hel sammenhengende kanal-strekning (se groupDuctRuns/buildDuctRunWalls) som
 * to parallelle vegglinjer + stiplet senterstripe (ingeniørtegning-stil) – med avrundet
 * fillet ved bend og innsnevret taper ved dimensjonsendring i stedet for hakk/sprang. */
function DuctRunSchematic({
  walls, color, invScale,
}: { walls: DuctRunWalls; color: string; invScale: number }) {
  const sw = Math.max(1.5 * invScale, 0.4);
  return (
    <Group listening={false}>
      <Line points={walls.outer} stroke={color} strokeWidth={sw} lineCap="round" lineJoin="round" />
      <Line points={walls.inner} stroke={color} strokeWidth={sw} lineCap="round" lineJoin="round" />
      {/* Senterlinje som klassisk «dash-dot»-kjedestrek (lang strek – prikk – lang strek),
          konvensjonen for kanal-/rørsenterlinjer i ingeniørtegninger. */}
      <Line
        points={walls.centerline}
        stroke={color}
        strokeWidth={sw * 0.55}
        opacity={0.55}
        dash={[12 * invScale, 3 * invScale, 1.5 * invScale, 3 * invScale]}
        lineCap="round"
        lineJoin="round"
      />
    </Group>
  );
}

/** Vinkel (0–360°) for det siste segmentet i en polylinje, brukt i statuslinjen
 * mens man tegner. */
function segmentAngleDeg(points: number[]): number | null {
  if (points.length < 4) return null;
  const x0 = points[points.length - 4];
  const y0 = points[points.length - 3];
  const x1 = points[points.length - 2];
  const y1 = points[points.length - 1];
  const deg = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  return (deg + 360) % 360;
}

// ── Linje-node ─────────────────────────────────────────────────────────────
interface LineNodeProps {
  line: LineEntity;
  selected: boolean;
  multiSelected: boolean;
  invScale: number;
  editable: boolean;
  metersPerPixel: number | null;
  onSelect: () => void;
  onToggleMultiSelect: () => void;
  /** Flytter hele linjen (kropp-dra) med (dx,dy) – strekker tilkoblede naboer og drar
   * med skjøt-markører/monterte symboler, i motsetning til onMoveVertex som kun
   * flytter ETT av de to endepunktene (brukt av knekkpunkt-håndtakene). */
  onMove: (dx: number, dy: number) => void;
  /** Flytter endepunkt `vertexIndex` (0 eller points.length-2) til (x,y) – strekker en
   * delt nabo med til det nye punktet og regner om bend-vinkelen i skjøtet, med mindre
   * `detach` (Alt-tasten) er satt, som gir den gamle, naive «bare dette punktet»-
   * oppførselen. Se moveLineVertex i store.ts. */
  onMoveVertex: (vertexIndex: number, x: number, y: number, detach: boolean) => void;
  onExtend: (fromStart: boolean) => void;
  /** Høyreklikk på kroppen – gir punktet (bildekoordinater, projisert på selve
   * senterlinjen) og vinkelen der, til å plassere kontekstmenyen med. */
  onOpenMenu: (point: { x: number; y: number; angleDeg: number }) => void;
  /** Hvilket av de to endepunktene (0=start, 1=slutt) som er ÅPENT – null når linja
   * ikke er den merkede (plusset vises kun for den ene, aktivt merkede linja). */
  openEnds: [boolean, boolean] | null;
  onOpenEndMenu: (fromStart: boolean, x: number, y: number) => void;
  /** Dobbeltklikk på kroppen – merker hele den sammenhengende strekningen linja er
   * en del av (valg 5), ikke bare dette 2-punkts segmentet. */
  onSelectRun: () => void;
  pipeRenderStyle: PipeRenderStyle;
  customColors: Record<string, string>;
  onVertexDragStart: () => void;
  onVertexDragEnd: () => void;
}

function LineNode({
  line,
  selected,
  multiSelected,
  invScale,
  editable,
  metersPerPixel,
  onSelect,
  onToggleMultiSelect,
  onMove,
  onMoveVertex,
  onExtend,
  onOpenMenu,
  openEnds,
  onOpenEndMenu,
  onSelectRun,
  pipeRenderStyle,
  customColors,
  onVertexDragStart,
  onVertexDragEnd,
}: LineNodeProps) {
  const sub = SUBCATEGORIES[line.subId];
  const duct = isDuctSub(line.subId);
  const color = colorFor(sub, customColors);
  // Reell pikselbredde iht. valgt dimensjon + målestokk (samme koordinatrom som
  // PDF-bildet, så bredden skalerer naturlig med zoom). Minimumsbredde sikrer at
  // røret er synlig selv før målestokk er satt eller ved langt utzoomet visning.
  const dimMm = dimensionDiameterMm(line.dimension);
  const diameterPx = Math.max(mmToPx(dimMm, metersPerPixel), 5 * invScale);
  const lineRef = useRef<Konva.Line>(null);

  const mid = midpoint(line.points);
  // Denne linjen er alltid ett rett 2-punkts segment (se addLineRun) – klikk på den
  // viser derfor kun DETTE strekkets egen lengde, ikke et helt sammenhengende løps.
  // Eldre lagrede fler-punkts linjer (fra før dette) beholder fortsatt egne bend-badges.
  const lenPx = polylineLength(line.points);
  const bends = selected ? polylineBendAngles(line.points) : [];

  function setVertex(i: number, x: number, y: number, detach: boolean) {
    onMoveVertex(i, x, y, detach);
  }

  return (
    <Group>
      {(selected || multiSelected) && (
        <Line
          points={line.points}
          stroke="#f5a623"
          strokeWidth={diameterPx + 6 * invScale}
          opacity={0.4}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      )}
      {duct ? null /* Kanalveggene tegnes samlet for hele strekningen av DuctRunSchematic
        ovenfor (se ductRuns), ikke her per segment – gir sammenhengende vegger uten
        hakk ved bend/overganger. Denne noden bidrar likevel med usynlig hit-linje +
        valg-glød under, uendret. */ : pipeRenderStyle === 'cylinder' ? (
        <PipeTube points={line.points} diameterPx={diameterPx} color={color} />
      ) : (
        <Line
          points={line.points}
          stroke={color}
          strokeWidth={3 * invScale}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      )}
      <Line
        ref={lineRef}
        points={line.points}
        stroke={color}
        strokeWidth={1}
        hitStrokeWidth={Math.max(diameterPx, 16 * invScale)}
        opacity={0}
        lineCap="round"
        lineJoin="round"
        draggable={editable && selected}
        listening={editable}
        onMouseDown={(e) => {
          // Kun venstreklikk her – ellers ville Shift+høyreklikk skrudd multi-merking
          // av/på som en bieffekt. Høyreklikk merker eksplisitt i onContextMenu i stedet.
          if (e.evt.button !== 0) return;
          e.cancelBubble = true;
          if (e.evt.shiftKey) onToggleMultiSelect();
          else onSelect();
        }}
        onTap={onSelect}
        onDblClick={(e) => {
          // Egen håndtak (ikke Stage-ens onDblClick, som kun avslutter en armert
          // tegneøkt) – lytter uansett bare mens tool==='select' (listening={editable}),
          // så det kan aldri kollidere med dobbeltklikk-avslutter-strekning.
          e.cancelBubble = true;
          onSelectRun();
        }}
        onDragEnd={(e) => {
          const node = e.target;
          const dx = node.x();
          const dy = node.y();
          node.position({ x: 0, y: 0 });
          // Flytt kun denne kanalen; naboer strekkes og komponenter følger med.
          onMove(dx, dy);
        }}
        onContextMenu={(e) => {
          // preventDefault er PÅKREVD her – Stage-handleren (handleContextMenu) er
          // ellers den eneste som kaller den, og cancelBubble stopper akkurat den fra
          // å kjøre, så uten dette ville nettleserens EGEN kontekstmeny dukket opp.
          e.evt.preventDefault();
          e.cancelBubble = true;
          const stage = e.target.getStage();
          const p = stage?.getRelativePointerPosition();
          if (!p) return;
          const cp = closestPointOnPolyline(line.points, p);
          onSelect(); // høyreklikk merker også, så plusset på åpne ender vises
          onOpenMenu({ x: cp?.x ?? p.x, y: cp?.y ?? p.y, angleDeg: cp?.angleDeg ?? 0 });
        }}
      />
      {bends.map((b, i) => (
        <BendBadge key={i} x={b.x} y={b.y} angleDeg={classifyBendAngle(b.angleDeg)} invScale={invScale} />
      ))}

      {/* Knekkpunkt-håndtak for redigering av tegnede rør/kanaler. Det gamle
          midtpunkt-håndtaket (klikk midt på segmentet for å dele det) er fjernet –
          det blokkerte kropp-draget (cancelBubble) og et enkelt klikk/slipp der man
          egentlig prøvde å GRIPE kanalen ble tolket som et «click» → delte kanalen i
          to («en ekstra kanal» i mengdelista). «Del»-verktøyet (tool === 'split')
          dekker splitting bevisst og forutsigbart nå. */}
      {selected &&
        editable &&
        Array.from({ length: line.points.length / 2 }, (_, i) => {
          const idx = i * 2;
          return (
            <Circle
              key={`v-${idx}`}
              x={line.points[idx]}
              y={line.points[idx + 1]}
              radius={6 * invScale}
              fill="#fff"
              stroke="#f5a623"
              strokeWidth={2 * invScale}
              draggable
              onMouseDown={(e) => {
                e.cancelBubble = true;
              }}
              onDragStart={onVertexDragStart}
              onDragMove={(e) => {
                // Shift holdt inne: lås retningen mot dette punktet til nærmeste
                // 45°-multiplum, målt fra linjens ANDRE endepunkt – samme regel og
                // samme hjelpefunksjon (snapFirstPoint) som når man tegner en ny linje.
                // Uten Shift er strekket fritt, som før.
                // Alt holdt inne: den gamle, naive oppførselen – kobler bevisst fra
                // naboen i stedet for å strekke den med (se moveLineVertex/detach).
                const detach = e.evt.altKey;
                if (e.evt.shiftKey) {
                  const otherIdx = idx === 0 ? 2 : 0;
                  const other = { x: line.points[otherIdx], y: line.points[otherIdx + 1] };
                  const snapped = snapFirstPoint(other, { x: e.target.x(), y: e.target.y() });
                  e.target.position(snapped); // ellers tegnes håndtaket på rå pekerposisjon
                  setVertex(idx, snapped.x, snapped.y, detach);
                } else {
                  setVertex(idx, e.target.x(), e.target.y(), detach);
                }
              }}
              onDragEnd={onVertexDragEnd}
              onDblClick={(e) => {
                e.cancelBubble = true;
                // Alle punkter er nå endepunkter (linjen er alltid 2-punkts) – dobbeltklikk
                // fortsetter alltid tegningen videre fra dette punktet.
                onExtend(idx === 0);
              }}
            />
          );
        })}

      {/* Pluss på åpne ender (kun den merkede linja, se openEndsOf i store.ts) – tegnet
          forskjøvet utover langs segmentretningen slik at det aldri overlapper
          knekkpunkt-håndtaket. Venstreklikk fortsetter tegningen direkte (samme vei som
          dobbeltklikk på håndtaket over); høyreklikk gir kontekstmenyen med det
          rør/kanal-tilpassede «Fortsett på …»-valget (CanvasContextMenu). */}
      {selected &&
        editable &&
        openEnds &&
        [0, 1].map((i) => {
          if (!openEnds[i]) return null;
          const n = line.points.length;
          const idx = i === 0 ? 0 : n - 2;
          const adjIdx = i === 0 ? 2 : n - 4;
          const px = line.points[idx];
          const py = line.points[idx + 1];
          const ax = line.points[adjIdx];
          const ay = line.points[adjIdx + 1];
          let dx = px - ax;
          let dy = py - ay;
          const segLen = Math.hypot(dx, dy) || 1;
          dx /= segLen;
          dy /= segLen;
          const offset = 18 * invScale;
          const cx = px + dx * offset;
          const cy = py + dy * offset;
          const r = 8 * invScale;
          const arm = r * 0.5;
          return (
            <Group key={`open-${idx}`}>
              <Line
                points={[px, py, cx, cy]}
                stroke="#2d9cdb"
                strokeWidth={1.5 * invScale}
                dash={[4 * invScale, 3 * invScale]}
                listening={false}
              />
              <Circle
                x={cx}
                y={cy}
                radius={r}
                fill="#2d9cdb"
                stroke="#fff"
                strokeWidth={1.5 * invScale}
                onMouseDown={(e) => {
                  // Kun venstreklikk fortsetter direkte – høyreklikk skal åpne menyen,
                  // ikke begge deler.
                  if (e.evt.button !== 0) return;
                  e.cancelBubble = true;
                  onExtend(i === 0);
                }}
                onContextMenu={(e) => {
                  e.evt.preventDefault();
                  e.cancelBubble = true;
                  onOpenEndMenu(i === 0, px, py);
                }}
              />
              <Line points={[cx - arm, cy, cx + arm, cy]} stroke="#fff" strokeWidth={1.6 * invScale} listening={false} />
              <Line points={[cx, cy - arm, cx, cy + arm]} stroke="#fff" strokeWidth={1.6 * invScale} listening={false} />
            </Group>
          );
        })}

      {selected && mid && (
        <Text
          x={mid.x + 8 * invScale}
          y={mid.y - 18 * invScale}
          text={formatLengthMm(lenPx, metersPerPixel)}
          fontSize={13 * invScale}
          fill="#111"
          fontStyle="bold"
          listening={false}
        />
      )}
    </Group>
  );
}

// ── Bend-merke ──────────────────────────────────────────────────────────────
function BendBadge({ x, y, angleDeg, invScale }: { x: number; y: number; angleDeg: number; invScale: number }) {
  return (
    <Group x={x} y={y} listening={false}>
      <Circle radius={4 * invScale} fill="#f5a623" />
      <Text
        text={`${angleDeg}°`}
        x={7 * invScale}
        y={-16 * invScale}
        fontSize={11.5 * invScale}
        fill="#b8860b"
        fontStyle="bold"
      />
    </Group>
  );
}

// ── Overgang-markør ──────────────────────────────────────────────────────────
function TransitionMarker({
  transition,
  invScale,
  selected,
  hideLabel,
  interactive,
  onSelect,
}: {
  transition: { x: number; y: number; fromDimension: string; toDimension: string };
  invScale: number;
  selected: boolean;
  hideLabel: boolean;
  interactive: boolean;
  onSelect: () => void;
}) {
  const r = 7 * invScale;
  return (
    <Group x={transition.x} y={transition.y}>
      {selected && <Circle radius={r + 5 * invScale} stroke="#f5a623" strokeWidth={2 * invScale} listening={false} />}
      <Line
        points={[0, -r, r, 0, 0, r, -r, 0]}
        closed
        stroke="#9b59b6"
        strokeWidth={2 * invScale}
        fill="rgba(155,89,182,0.18)"
        listening={false}
      />
      {!hideLabel && (
        <Text
          text={`${transition.fromDimension}→${transition.toDimension}`}
          x={r + 4 * invScale}
          y={-7 * invScale}
          fontSize={11 * invScale}
          fill="#9b59b6"
          fontStyle="bold"
          listening={false}
        />
      )}
      <Circle
        // Krympet fra max(r+6,14) til r+2: den store treffsirkelen lå OVER kanalen
        // og «spiste» klikk/dra som egentlig var ment for kanalkroppen under (se
        // kommentaren ved LineNode sitt fjernede midtpunkt-håndtak).
        radius={r + 2 * invScale}
        opacity={0}
        listening={interactive}
        onMouseDown={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
      />
    </Group>
  );
}

// ── Avgreining-markør ────────────────────────────────────────────────────────
function BranchMarker({
  branch,
  invScale,
  selected,
  hideLabel,
  interactive,
  onSelect,
  onEditType,
}: {
  branch: BranchEntity;
  invScale: number;
  selected: boolean;
  hideLabel: boolean;
  interactive: boolean;
  onSelect: () => void;
  onEditType: () => void;
}) {
  const color = SUBCATEGORIES[branch.subId]?.color ?? '#9b59b6';
  const r = 10 * invScale;
  return (
    <Group x={branch.x} y={branch.y} rotation={branch.angleDeg}>
      {selected && <Circle radius={r + 5 * invScale} stroke="#f5a623" strokeWidth={2 * invScale} listening={false} />}
      <Group scaleX={invScale} scaleY={invScale} listening={false}>
        <BranchGlyph type={branch.fittingType} color={color} />
      </Group>
      {!hideLabel && (
        <Text
          text={`${branchFittingLabel(branch.fittingType)} ${branch.dimension}→${branch.branchDimension}`}
          x={r + 2 * invScale}
          y={-6 * invScale}
          rotation={-branch.angleDeg}
          fontSize={10.5 * invScale}
          fill={color}
          fontStyle="bold"
          listening={false}
        />
      )}
      <Circle
        // Krympet fra max(r+6,14) til r+2 – se TransitionMarker over.
        radius={r + 2 * invScale}
        opacity={0}
        listening={interactive}
        onMouseDown={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onDblClick={(e) => {
          e.cancelBubble = true;
          onEditType();
        }}
      />
    </Group>
  );
}

// ── Bend-markør (persistert) ─────────────────────────────────────────────────
/** Viser bend-vinkelen der to sammenhengende rette rør-/kanalsegmenter møtes i en
 * annen retning – hvert rett segment er sin egen linje-entitet (se addLineRun),
 * så dette er en egen, valgbar/slettbar markør (à la overgang/avgreining). */
function BendMarker({
  bend,
  invScale,
  selected,
  interactive,
  onSelect,
}: {
  bend: BendEntity;
  invScale: number;
  selected: boolean;
  interactive: boolean;
  onSelect: () => void;
}) {
  // Bend-punktet vises nå som en jevn avrundet sving på selve kanalveggen (se
  // DuctRunSchematic) – prikk+gradtall er derfor bare synlig ved valg, for å slippe
  // unødvendig visuell støy på hvert eneste bend i en ferdig tegning.
  return (
    <Group x={bend.x} y={bend.y}>
      {selected && (
        <>
          <Circle radius={9 * invScale} stroke="#f5a623" strokeWidth={2 * invScale} listening={false} />
          <Circle radius={4 * invScale} fill="#f5a623" listening={false} />
          <Text
            text={`${bend.angleDeg}°`}
            x={7 * invScale}
            y={-16 * invScale}
            fontSize={11.5 * invScale}
            fill="#b8860b"
            fontStyle="bold"
            listening={false}
          />
        </>
      )}
      <Circle
        // Krympet fra 12 til 6 – se TransitionMarker over (samme årsak: en for stor
        // treffsirkel lå oppå kanalen og hindret at man kunne gripe kroppen der).
        radius={6 * invScale}
        opacity={0}
        listening={interactive}
        onMouseDown={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
      />
    </Group>
  );
}

// ── Klammer-markør (bæring for rør/kanal, med tilhørende gjengestag) ────────
/** Tegnes som en liten tverrgående bøyle/stropp på tvers av rør-/kanalretningen –
 * `clamp.angleDeg` er retningen LANGS bæreren (samme mønster som BranchEntity),
 * så selve glyph-en tegnes loddrett i lokale koordinater og roteres til å stå på
 * tvers av retningen når Gruppen roteres. Kan flyttes (dra, eller piltaster når
 * valgt) og slettes som enhver annen markør. */
function ClampMarker({
  clamp,
  invScale,
  selected,
  interactive,
  onSelect,
  onChange,
}: {
  clamp: ClampEntity;
  invScale: number;
  selected: boolean;
  interactive: boolean;
  onSelect: () => void;
  onChange: (x: number, y: number) => void;
}) {
  const color = selected ? '#f5a623' : '#6d4c41';
  const half = 9 * invScale;
  return (
    <Group
      x={clamp.x}
      y={clamp.y}
      rotation={clamp.angleDeg}
      draggable={interactive && selected}
      onMouseDown={(e) => {
        if (!interactive) return;
        e.cancelBubble = true;
        onSelect();
      }}
      onDragEnd={(e) => onChange(e.target.x(), e.target.y())}
    >
      {selected && <Circle radius={half + 5 * invScale} stroke="#f5a623" strokeWidth={2 * invScale} listening={false} />}
      {/* Bøyle på tvers av rør-/kanalretningen, med to «boltehull»-prikker i endene. */}
      <Line points={[0, -half, 0, half]} stroke={color} strokeWidth={2.5 * invScale} listening={false} />
      <Circle x={0} y={-half} radius={1.6 * invScale} fill={color} listening={false} />
      <Circle x={0} y={half} radius={1.6 * invScale} fill={color} listening={false} />
      <Circle
        radius={Math.max(half + 4 * invScale, 12 * invScale)}
        opacity={0}
        listening={interactive}
      />
    </Group>
  );
}

// ── Symbol-node ─────────────────────────────────────────────────────────────
interface SymbolNodeProps {
  sym: SymbolEntity;
  selected: boolean;
  nodeScale: { scaleX: number; scaleY: number };
  showAirflowArrows: boolean;
  editable: boolean;
  color?: string;
  invScale: number;
  hideLabel: boolean;
  customComponents: CustomComponentDef[];
  onSelect: () => void;
  onChange: (x: number, y: number) => void;
  onHover: (hovering: boolean) => void;
}

/** Nominell glyph-bredde i lokale enheter (≈ spjeld-boksens 2·r). Symbolet
 * skaleres slik at kroppen får omtrent samme bredde som kanalen/røret det
 * monteres på. */
const SYMBOL_GLYPH_UNITS = 22;
/** Ytre kvadrat-side for diffusor-glyph-en i lokale enheter (2·s = 2·r·1,1).
 * Brukes for å skalere tilluft-/avtrekksventiler til nøyaktig fysisk størrelse. */
const DIFFUSER_GLYPH_UNITS = SYMBOL_GLYPH_UNITS * 1.1;
/** Fast fysisk størrelse (mm) for tilluft-/avtrekksventiler – uavhengig av
 * kanaldimensjonen de er montert på. */
const DIFFUSER_SIZE_MM = 600;
/** Minste lesbare skjermstørrelse for et symbol (px), brukt som nedre grense ved
 * sterk utzooming eller svært tynne rør/kanaler. */
const SYMBOL_MIN_SCREEN_PX = 12;

/** Aggregat-glyphens nominelle bredde/høyde i lokale enheter (se AhuGlyph). */
const AHU_GLYPH_UNITS = SYMBOL_GLYPH_UNITS;

/** Beregner den endelige skaleringen for et utstyrssymbol som `{ scaleX, scaleY }`.
 * De fleste symboler skaleres uniformt (scaleX===scaleY) etter kanaldimensjonen de
 * er montert på, eller eget dimensjonsfelt. Ventilasjonsaggregat skaleres derimot
 * ikke-uniformt etter oppgitt bredde × lengde. Symboler tegnes i verdenskoordinater
 * slik at de holder seg proporsjonale med tegningen ved zoom. En nedre grense hindrer
 * at symbolet blir uleselig lite; faller tilbake til en fast skjermstørrelse når verken
 * dimensjon eller målestokk er tilgjengelig. */
function symbolRenderScale(
  sym: SymbolEntity,
  lines: LineEntity[],
  metersPerPixel: number | null,
  invScale: number,
): { scaleX: number; scaleY: number } {
  const uniform = (s: number) => ({ scaleX: s, scaleY: s });
  // Ventilasjonsaggregat: ikke-uniform, skalert til oppgitt bredde × lengde (mm).
  if (sym.type === 'air_handling_unit') {
    if (metersPerPixel) {
      const widthMm = Number(sym.props.width) || 1200;
      const lengthMm = Number(sym.props.length) || 2000;
      const wPx = Math.max(mmToPx(widthMm, metersPerPixel), SYMBOL_MIN_SCREEN_PX * invScale);
      const lPx = Math.max(mmToPx(lengthMm, metersPerPixel), SYMBOL_MIN_SCREEN_PX * invScale);
      return { scaleX: wPx / AHU_GLYPH_UNITS, scaleY: lPx / AHU_GLYPH_UNITS };
    }
    return uniform(invScale);
  }
  // Tilluft-/avtrekksventiler har fast fysisk størrelse (600×600 mm), uavhengig
  // av kanaldimensjonen de er montert på. Diffusor-glyph-ens ytre kvadrat
  // (DIFFUSER_GLYPH_UNITS lokale enheter) skaleres til 600 mm i verdenspiksler.
  if (sym.type === 'supply_diffuser' || sym.type === 'extract_diffuser') {
    if (metersPerPixel) {
      const sidePx = Math.max(mmToPx(DIFFUSER_SIZE_MM, metersPerPixel), SYMBOL_MIN_SCREEN_PX * invScale);
      return uniform(sidePx / DIFFUSER_GLYPH_UNITS);
    }
    return uniform(invScale);
  }
  let dimMm: number | null = null;
  if (sym.mountedLineId) {
    const line = lines.find((l) => l.id === sym.mountedLineId);
    if (line) dimMm = dimensionDiameterMm(line.dimension);
  }
  if (dimMm == null) {
    const raw = sym.props.dimension ?? sym.props.dn;
    if (raw) dimMm = dimensionDiameterMm(String(raw));
  }
  if (dimMm != null && Number.isFinite(dimMm) && dimMm > 0 && metersPerPixel) {
    const diameterPx = mmToPx(dimMm, metersPerPixel); // verdenspiksler
    // Symbolkroppen (SYMBOL_GLYPH_UNITS lokale enheter) skaleres til denne
    // mål-bredden i verdenspiksler; nedre grense = min. lesbar skjermstørrelse
    // (SYMBOL_MIN_SCREEN_PX px ⇒ SYMBOL_MIN_SCREEN_PX·invScale verdenspiksler).
    const targetPx = Math.max(diameterPx, SYMBOL_MIN_SCREEN_PX * invScale);
    return uniform(targetPx / SYMBOL_GLYPH_UNITS);
  }
  // Ingen målestokk/dimensjon: fast lesbar skjermstørrelse.
  return uniform(invScale);
}

function SymbolNode({
  sym,
  selected,
  nodeScale,
  showAirflowArrows,
  editable,
  color,
  invScale,
  hideLabel,
  customComponents,
  onSelect,
  onChange,
  onHover,
}: SymbolNodeProps) {
  const genericGlyph = glyphShapeFor(sym.type, customComponents);
  // Ventilasjonsaggregatets glyph er kun en ren firkant (symbols.tsx) – navnet og
  // målene skrives her, UTENFOR den ikke-uniformt skalerte gruppen (ellers ville
  // teksten blitt strukket sammen med boksen), og motroteres slik at den alltid
  // står vannrett på skjermen uansett symbolets rotasjon (samme triks som
  // BranchMarker bruker for sin etikett).
  const showAhuLabel = sym.type === 'air_handling_unit' && !hideLabel;
  const ahuHalfW = (SYMBOL_GLYPH_UNITS / 2) * nodeScale.scaleX;
  const ahuHalfH = (SYMBOL_GLYPH_UNITS / 2) * nodeScale.scaleY;
  const ahuWidthMm = Number(sym.props.width) || 1200;
  const ahuLengthMm = Number(sym.props.length) || 2000;

  return (
    <Group
      x={sym.x}
      y={sym.y}
      rotation={sym.rotation}
      draggable={editable && selected}
      onMouseDown={(e) => {
        if (!editable) return;
        e.cancelBubble = true;
        onSelect();
      }}
      onTap={onSelect}
      onDblClick={(e) => {
        if (!editable) return;
        e.cancelBubble = true;
        onSelect();
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onDragEnd={(e) => onChange(e.target.x(), e.target.y())}
    >
      <Group scaleX={nodeScale.scaleX} scaleY={nodeScale.scaleY}>
        <SymbolGlyph
          type={sym.type}
          selected={selected}
          showArrows={showAirflowArrows}
          color={color}
          genericGlyph={genericGlyph}
        />
      </Group>
      {showAhuLabel && (
        <Group x={-Math.max(ahuHalfW, 60 * invScale)} y={ahuHalfH + 6 * invScale} rotation={-sym.rotation}>
          <Text
            text={`Ventilasjonsaggregat\n${ahuWidthMm}×${ahuLengthMm} mm`}
            width={Math.max(ahuHalfW, 60 * invScale) * 2}
            align="center"
            fontSize={11 * invScale}
            lineHeight={1.2}
            fill={selected ? '#f5a623' : '#1f2933'}
            fontStyle="bold"
            listening={false}
          />
        </Group>
      )}
    </Group>
  );
}

function midpoint(points: number[]): { x: number; y: number } | null {
  if (points.length < 4) return null;
  // Midtpunkt på den geometriske traseen
  const total = polylineLength(points);
  let acc = 0;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const segLen = distance(points[i], points[i + 1], points[i + 2], points[i + 3]);
    if (acc + segLen >= total / 2) {
      const t = (total / 2 - acc) / (segLen || 1);
      return {
        x: points[i] + (points[i + 2] - points[i]) * t,
        y: points[i + 1] + (points[i + 3] - points[i + 1]) * t,
      };
    }
    acc += segLen;
  }
  return { x: points[0], y: points[1] };
}

// ── Annotasjon (tekst/tekstboks/melding/sky/former/marker) ──────────────────
interface AnnotationNodeProps {
  note: AnnotationEntity;
  selected: boolean;
  invScale: number;
  editable: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<AnnotationEntity>) => void;
  onEditText: () => void;
}

function AnnotationNode({ note, selected, invScale, editable, onSelect, onChange, onEditText }: AnnotationNodeProps) {
  const w = note.width ?? 160;
  const h = note.height ?? 100;
  const isPointBased = POINT_ANNOTATION_TYPES.has(note.type);
  const points = note.points ?? [];

  // Utvalgs-omriss: bounding box rundt selve formen, i lokale (gruppe-relative)
  // koordinater. Punkt-baserte former (linje/pil/polygon) beregner sin egen bbox
  // fra punktene, siden de ikke har en fast bredde/høyde.
  let outline = { x: -6 * invScale, y: -6 * invScale, w: w + 12 * invScale, h: h + 12 * invScale };
  if (note.type === 'text') {
    outline = {
      x: -6 * invScale,
      y: -6 * invScale,
      w: (note.text?.length ?? 4) * (note.fontSize ?? 14) * 0.6 + 12 * invScale,
      h: (note.fontSize ?? 14) + 12 * invScale,
    };
  } else if (isPointBased && points.length >= 4) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i + 1 < points.length; i += 2) {
      minX = Math.min(minX, points[i]);
      maxX = Math.max(maxX, points[i]);
      minY = Math.min(minY, points[i + 1]);
      maxY = Math.max(maxY, points[i + 1]);
    }
    outline = { x: minX - 6 * invScale, y: minY - 6 * invScale, w: maxX - minX + 12 * invScale, h: maxY - minY + 12 * invScale };
  }

  const strokeWidth = note.strokeWidth ?? 2;
  const hitStrokeWidth = Math.max(strokeWidth * invScale, 12 * invScale);

  return (
    <Group
      x={note.x}
      y={note.y}
      draggable={editable && selected}
      onMouseDown={(e) => {
        if (!editable) return;
        e.cancelBubble = true;
        onSelect();
      }}
      onDblClick={(e) => {
        if (!editable) return;
        e.cancelBubble = true;
        if (note.type === 'text' || TEXT_BOX_ANNOTATION_TYPES.has(note.type)) onEditText();
      }}
      onDragEnd={(e) => {
        const node = e.target;
        if (isPointBased) {
          // Punkt-baserte former lagrer geometri absolutt i `points` (x/y er alltid 0) –
          // flytt punktene med drag-forskyvningen og nullstill node-posisjonen, samme
          // mønster som linjekroppens dra-håndtering (LineNode).
          const dx = node.x();
          const dy = node.y();
          node.position({ x: 0, y: 0 });
          onChange({ points: (note.points ?? []).map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) });
        } else {
          onChange({ x: node.x(), y: node.y() });
        }
      }}
    >
      {note.type === 'text' && (
        <Text
          text={note.text ?? ''}
          fontSize={(note.fontSize ?? 14) * invScale}
          fill={note.color}
          fontStyle={selected ? 'bold' : 'normal'}
        />
      )}
      {note.type === 'cloud' && (
        <>
          <Rect width={w} height={h} opacity={0} listening={editable} />
          <CloudShape width={w} height={h} color={note.color} strokeWidth={strokeWidth} invScale={invScale} />
        </>
      )}
      {(note.type === 'rect' || note.type === 'ellipse') && (
        <>
          <Rect width={w} height={h} opacity={0} listening={editable} />
          {note.type === 'rect' ? (
            <Rect
              width={w}
              height={h}
              stroke={note.color}
              strokeWidth={strokeWidth * invScale}
              fill={note.fill}
              listening={false}
            />
          ) : (
            <Ellipse
              x={w / 2}
              y={h / 2}
              radiusX={w / 2}
              radiusY={h / 2}
              stroke={note.color}
              strokeWidth={strokeWidth * invScale}
              fill={note.fill}
              listening={false}
            />
          )}
        </>
      )}
      {note.type === 'highlight' && (
        <Rect
          width={w}
          height={h}
          fill={note.color}
          opacity={note.opacity ?? 0.35}
          listening={editable}
        />
      )}
      {TEXT_BOX_ANNOTATION_TYPES.has(note.type) && (
        <>
          {note.type === 'callout' && note.anchorX != null && note.anchorY != null && (
            <Line
              points={[note.anchorX - note.x, note.anchorY - note.y, w / 2, h / 2]}
              stroke={note.color}
              strokeWidth={1.5 * invScale}
              listening={false}
            />
          )}
          <Rect width={w} height={h} stroke={note.color} strokeWidth={1.5 * invScale} fill="#fff" listening={editable} />
          <Text
            text={note.text ?? ''}
            x={6 * invScale}
            y={6 * invScale}
            width={w - 12 * invScale}
            fontSize={(note.fontSize ?? 14) * invScale}
            fill={note.color}
            listening={false}
          />
        </>
      )}
      {note.type === 'line' && (
        <Line points={points} stroke={note.color} strokeWidth={strokeWidth * invScale} hitStrokeWidth={hitStrokeWidth} lineCap="round" />
      )}
      {note.type === 'arrow' && (
        <Arrow
          points={points}
          stroke={note.color}
          fill={note.color}
          strokeWidth={strokeWidth * invScale}
          hitStrokeWidth={hitStrokeWidth}
          pointerLength={10 * invScale}
          pointerWidth={9 * invScale}
        />
      )}
      {note.type === 'polygon' && (
        <Line
          points={points}
          stroke={note.color}
          strokeWidth={strokeWidth * invScale}
          closed
          fill={note.fill}
          hitStrokeWidth={hitStrokeWidth}
        />
      )}
      {selected && (
        <Rect
          x={outline.x}
          y={outline.y}
          width={outline.w}
          height={outline.h}
          stroke="#f5a623"
          strokeWidth={1.5 * invScale}
          dash={[4 * invScale, 3 * invScale]}
          listening={false}
        />
      )}
    </Group>
  );
}

// ── Måling (punkt-til-punkt avstand / rom-areal) ────────────────────────────
interface MeasurementNodeProps {
  measurement: MeasurementEntity;
  metersPerPixel: number | null;
  selected: boolean;
  invScale: number;
  interactive: boolean;
  onSelect: () => void;
}

function MeasurementNode({ measurement, metersPerPixel, selected, invScale, interactive, onSelect }: MeasurementNodeProps) {
  const color = selected ? '#f5a623' : '#7c4dff';
  const isArea = measurement.type === 'area';
  const label = isArea
    ? formatAreaM2(polygonArea(measurement.points), metersPerPixel)
    : formatLengthMm(polylineLength(measurement.points), metersPerPixel);
  const labelPos = isArea
    ? polygonCentroid(measurement.points)
    : { x: (measurement.points[0] + measurement.points[2]) / 2, y: (measurement.points[1] + measurement.points[3]) / 2 };
  const fontSize = 12 * invScale;
  return (
    <Group listening={interactive} onMouseDown={(e) => { e.cancelBubble = true; onSelect(); }}>
      <Line
        points={measurement.points}
        stroke={color}
        strokeWidth={1.5 * invScale}
        closed={isArea}
        fill={isArea ? (selected ? 'rgba(245,166,35,0.12)' : 'rgba(124,77,255,0.1)') : undefined}
        hitStrokeWidth={12 * invScale}
      />
      <Rect
        x={labelPos.x - (label.length * fontSize * 0.3)}
        y={labelPos.y - fontSize * 0.85}
        width={label.length * fontSize * 0.6}
        height={fontSize * 1.6}
        fill="#fff"
        stroke={color}
        strokeWidth={1 * invScale}
        cornerRadius={3 * invScale}
        listening={false}
      />
      <Text
        text={label}
        x={labelPos.x - (label.length * fontSize * 0.3)}
        y={labelPos.y - fontSize * 0.6}
        width={label.length * fontSize * 0.6}
        align="center"
        fontSize={fontSize}
        fill="#1f2933"
        listening={false}
      />
    </Group>
  );
}

// ── Tag (merkelapp med leaderlinje) ─────────────────────────────────────────
interface TagNodeProps {
  tag: TagEntity;
  /** Ferdig utledet visningstekst (rørtype+dimensjon, eller kun dimensjon for kanaler) */
  text: string;
  /** Samme farge som underkategorien taggen er festet til, for visuell sammenheng */
  color: string;
  selected: boolean;
  invScale: number;
  editable: boolean;
  onSelect: () => void;
  onChange: (labelX: number, labelY: number) => void;
}

function TagNode({ tag, text, color, selected, invScale, editable, onSelect, onChange }: TagNodeProps) {
  const padX = 6 * invScale;
  const padY = 4 * invScale;
  const fontSize = 12 * invScale;
  const boxW = text.length * fontSize * 0.6 + padX * 2;
  const boxH = fontSize + padY * 2;
  return (
    <Group>
      {/* Leaderlinje fra ankerpunktet på røret/kanalen til tag-boksen */}
      <Line
        points={[tag.x, tag.y, tag.labelX, tag.labelY]}
        stroke={selected ? '#f5a623' : color}
        strokeWidth={1.2 * invScale}
        listening={false}
      />
      <Circle x={tag.x} y={tag.y} radius={2.5 * invScale} fill={selected ? '#f5a623' : color} listening={false} />
      <Group
        x={tag.labelX}
        y={tag.labelY}
        offsetX={boxW / 2}
        offsetY={boxH / 2}
        draggable={editable}
        onMouseDown={(e) => {
          if (!editable) return;
          e.cancelBubble = true;
          onSelect();
        }}
        onDragEnd={(e) => onChange(e.target.x() + boxW / 2, e.target.y() + boxH / 2)}
      >
        <Rect
          width={boxW}
          height={boxH}
          fill="#fff"
          stroke={selected ? '#f5a623' : color}
          strokeWidth={1.2 * invScale}
          cornerRadius={3 * invScale}
        />
        <Text text={text} x={padX} y={padY} fontSize={fontSize} fill="#1f2933" />
      </Group>
    </Group>
  );
}

/** Punkter langs omrisset av et rektangel med jevn avstand, brukt til å tegne
 * en skallert «revisjonssky»-kontur av overlappende sirkler. */
function cloudBumpPoints(width: number, height: number, bumpSize: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const edges: [number, number, number, number][] = [
    [0, 0, width, 0],
    [width, 0, width, height],
    [width, height, 0, height],
    [0, height, 0, 0],
  ];
  for (const [x0, y0, x1, y1] of edges) {
    const segLen = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.round(segLen / bumpSize));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      points.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
    }
  }
  return points;
}

function CloudShape({
  width,
  height,
  color,
  strokeWidth,
  invScale,
}: {
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
  invScale: number;
}) {
  const bumpSize = 22;
  const bumps = cloudBumpPoints(width, height, bumpSize);
  return (
    <>
      {bumps.map((b, i) => (
        <Circle
          key={i}
          x={b.x}
          y={b.y}
          radius={bumpSize * 0.62}
          stroke={color}
          strokeWidth={strokeWidth * invScale}
          listening={false}
        />
      ))}
    </>
  );
}
