import { useCallback, useEffect, useRef, useState } from 'react';
import { Arrow, Circle, Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import { FileSearch, Lightbulb, Plus, X } from 'lucide-react';
import { useStore } from '../store';
import { clampScale } from '../store';
import { renderPage } from '../lib/pdf';
import {
  POINT_ANNOTATION_TYPES,
  SUBCATEGORIES,
  SYMBOL_DEFS,
  TEXT_ANNOTATION_TYPES,
  TEXT_BOX_ANNOTATION_TYPES,
  annotationTypeLabel,
  branchFittingLabel,
  categoryOf,
  colorFor,
  defaultBranchFittingForPipe,
  dimensionsForMaterial,
  getBendAngles,
  isDuctSub,
  mergedOptions,
  tagLabel,
} from '../types';
import type {
  AnnotationEntity,
  AnnotationType,
  BendEntity,
  BranchEntity,
  ClampEntity,
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
import { SymbolGlyph, BranchGlyph } from './symbols';
import { PipeTube } from './PipeTube';
import { SymbolTooltip } from './SymbolTooltip';
import { BranchChoicePopover } from './BranchChoicePopover';

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
  const nudgeSelected = useStore((s) => s.nudgeSelected);
  const moveSingleLine = useStore((s) => s.moveSingleLine);
  const nudgeTag = useStore((s) => s.nudgeTag);
  const lineConfig = useStore((s) => s.lineConfig);
  const hoveredSymbolId = useStore((s) => s.hoveredSymbolId);
  const pipeRenderStyle = useStore((s) => s.pipeRenderStyle);

  const addLineRun = useStore((s) => s.addLineRun);
  const splitLineAt = useStore((s) => s.splitLineAt);
  const placeSymbolWithGuard = useStore((s) => s.placeSymbolWithGuard);
  const showAirflowArrows = useStore((s) => s.showAirflowArrows);
  const customSystems = useStore((s) => s.customSystems);
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
  const updateLineConfigDimension = useStore((s) => s.updateLineConfigDimension);
  const setLineSelection = useStore((s) => s.setLineSelection);
  const select = useStore((s) => s.select);
  const setTool = useStore((s) => s.setTool);
  const clearSelection = useStore((s) => s.clearSelection);
  const updateLinePoints = useStore((s) => s.updateLinePoints);
  const updateSymbol = useStore((s) => s.updateSymbol);
  const setHoveredSymbol = useStore((s) => s.setHoveredSymbol);
  const deleteSelected = useStore((s) => s.deleteSelected);
  const setCalibrationDistance = useStore((s) => s.setCalibrationDistance);
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
    kind: 'continue' | 'branch' | 'mount';
  } | null>(null);
  // Snap-indikator for måleverktøyene (avstand/areal) – hvilken type punkt musepekeren
  // akkurat nå er snappet til, kun til visning (selve punktet som brukes er `cursor`).
  const [measureSnapKind, setMeasureSnapKind] = useState<'endpoint' | 'online' | 'symbol' | 'close' | null>(null);
  // Klikk+dra-definisjon av en rektangulær arealmåling (kun når arealmodus = 'rect')
  const [rectDraft, setRectDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // Midlertidig panorering ved å holde inne Mellomrom (og dra med venstre knapp),
  // uavhengig av aktivt verktøy – mister ikke pågående tegning/måling.
  const [isSpacePan, setIsSpacePan] = useState(false);
  const spacePanRef = useRef(false);
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
  const isPan = tool === 'pan';
  const activeSubId = isLineTool ? tool.slice('line:'.length) : null;
  const activeSub = activeSubId ? SUBCATEGORIES[activeSubId] : null;
  const activeMaterial = activeSubId ? lineConfig[activeSubId]?.material : undefined;
  const activeBendAngles = activeMaterial ? getBendAngles(activeMaterial) : [];

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
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        // Avbryt all pågående tegning/markup.
        setDraftPoints([]);
        setContinuationAnchor(null);
        setCalibPoints([]);
        setMeasureDraftPoints([]);
        setPolygonDraftPoints([]);
        setCloudDraft(null);
        setBoxDraft(null);
        setLineDraft(null);
        setRectDraft(null);
        // Fra et tegne-/markup-/måle-/symbol-/tag-/kalibrerverktøy → tilbake til panorering.
        // Ellers (allerede velg/panorer) tømmer vi bare utvalget.
        const inDrawingTool =
          isLineTool || isAnnotationTool || isMeasureTool || isSymbolTool || tool === 'tag' || tool === 'calibrate';
        if (inDrawingTool) {
          setTool('pan');
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
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (multiSelection.size > 0) deleteMany(Array.from(multiSelection));
        else deleteSelected();
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
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) * invScale;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        if (multiSelection.size === 0 && selectedKind === 'line' && selectedId) {
          // Kun én kanal valgt: flytt kun den, og strekk tilkoblede naboer (moveSingleLine).
          moveSingleLine(selectedId, dx, dy, !e.repeat);
        } else {
          // Flervalg: flytt hele den sammenhengende strekningen rigid (nudgeSelected).
          nudgeSelected(dx, dy, !e.repeat);
        }
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
    nudgeSelected,
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
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePanRef.current = false;
        setIsSpacePan(false);
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
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

  // Avbryt pågående tegning når verktøy byttes, og forbered ny tegnesesjon
  useEffect(() => {
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, currentPage]);

  /** Finner nærmeste linje av en gitt kind (rør/kanal) innenfor toleranse for et punkt –
   * brukes til å snappe en ny linjes start/slutt inn på et eksisterende rør/kanal slik
   * at det automatisk settes inn en avgreiningsdel (T-rør/45°-grenrør/påstikk/T-kanal). */
  const findBranchTarget = useCallback(
    (point: { x: number; y: number }, kind: 'pipe' | 'duct') => {
      let best: { line: LineEntity; x: number; y: number; distance: number; angleDeg: number } | null = null;
      for (const line of lines) {
        if (line.page !== currentPage) continue;
        if (categoryOf(line.subId)?.kind !== kind) continue;
        const cp = closestPointOnPolyline(line.points, point);
        if (!cp) continue;
        const dimMm = dimensionDiameterMm(line.dimension);
        const tol = Math.max(mmToPx(dimMm, scale.metersPerPixel), 16 * invScale);
        if (cp.distance <= tol && (!best || cp.distance < best.distance)) {
          best = { line, x: cp.x, y: cp.y, distance: cp.distance, angleDeg: cp.angleDeg };
        }
      }
      return best;
    },
    [lines, currentPage, scale.metersPerPixel, invScale],
  );

  /** Setter inn en avgreiningsdel (eller ber bruker velge type for kanal) for et allerede
   * funnet treff, og returnerer det snappede punktet. */
  const insertBranchForTarget = useCallback(
    (
      target: { line: LineEntity; x: number; y: number; angleDeg: number },
      branchDimension: string,
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

  /** Avstand (px) fra et punkt til et av endepunktene til en tegnet linje, brukt til å
   * avgjøre om et treff på en eksisterende linje skjer nøyaktig på et endepunkt (→ fortsett
   * samme rør) eller midt på linja (→ sett inn avgreiningsdel). */
  function endpointHitOf(
    line: LineEntity,
    x: number,
    y: number,
    tol: number,
  ): 'start' | 'end' | null {
    const n = line.points.length;
    if (distance(x, y, line.points[0], line.points[1]) <= tol) return 'start';
    if (distance(x, y, line.points[n - 2], line.points[n - 1]) <= tol) return 'end';
    return null;
  }

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

  const getImagePoint = useCallback((): { x: number; y: number } | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const p = stage.getRelativePointerPosition();
    return p ? { x: p.x, y: p.y } : null;
  }, []);

  /** Snapper et punkt til nærmeste tillatte bend-vinkel hvis Shift holdes inne (for
   * påfølgende segmenter), eller til nærmeste 45°-multiplum i absolutt retning for det
   * aller første segmentet i en ny polylinje (ingen forrige retning å måle turn mot) –
   * med mindre man fortsetter et eksisterende rør/kanal (continuationAnchor), da måles
   * vinkelen i stedet mot DET rørets retning, akkurat som et vanlig påfølgende segment. */
  const computeLinePoint = useCallback(
    (raw: { x: number; y: number }, shiftKey: boolean): { x: number; y: number } => {
      if (!shiftKey || !isLineTool) return raw;
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
      // Mens Mellomrom holdes inne panorerer venstre-dra hele lerretet (Konva drar
      // stagen fordi draggable er på) – ikke legg til punkter/velg noe da.
      if (spacePanRef.current) return;
      // Bare reager på klikk i tomt område (selve stagen / bakgrunnen)
      const clickedEmpty = e.target === e.target.getStage();
      const p = getImagePoint();
      if (!p) return;

      if (isLineTool) {
        let point = computeLinePoint(p, e.evt.shiftKey);
        // Tegnestart på et eksisterende rør/kanal: endepunkt av SAMME underkategori →
        // fortsett (forleng) det røret direkte. Midt på linja, eller endepunkt av en
        // annen underkategori → sett inn en avgreiningsdel som før.
        if (draftPoints.length === 0 && activeSubId) {
          const kind = categoryOf(activeSubId)?.kind;
          const target = kind ? findBranchTarget(point, kind) : null;
          if (target) {
            const tol = Math.max(
              mmToPx(dimensionDiameterMm(target.line.dimension), scale.metersPerPixel),
              16 * invScale,
            );
            const endpointHit = endpointHitOf(target.line, target.x, target.y, tol);
            if (endpointHit && target.line.subId === activeSubId) {
              // Fortsett fra endepunktet. Har brukeren valgt et annet mål enn det
              // eksisterende røret, settes en overgang inn i skjøten automatisk.
              seedContinuation(target.line, endpointHit === 'start', draftDimension ?? undefined);
              setShowShiftTip(false);
              return;
            }
            point = insertBranchForTarget(target, draftDimension ?? activeSub?.dimensions[0] ?? '');
          }
        }
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
          const dimMm = dimensionDiameterMm(line.dimension);
          const tol = Math.max(mmToPx(dimMm, scale.metersPerPixel), 16 * invScale);
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
          const dimMm = dimensionDiameterMm(line.dimension);
          const tol = Math.max(mmToPx(dimMm, scale.metersPerPixel), 16 * invScale);
          if (cp.distance <= tol && (!best || cp.distance < best.distance)) {
            best = { x: cp.x, y: cp.y, distance: cp.distance, lineId: line.id };
          }
        }
        if (best) addTag(best.lineId, best.x, best.y);
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
        !isMeasureTool &&
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
          // Rektangelmodus bruker klikk-og-dra; ingen punkt-snap-indikator.
          setCursor(null);
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
      }

      // Forhåndsvis hva et klikk nå ville gjort: fortsette et eksisterende rør/kanal,
      // sette inn en avgreining, eller montere utstyr – samme treff-logikk som ved klikk.
      if (isLineTool && draftPoints.length === 0 && activeSubId) {
        const kind = categoryOf(activeSubId)?.kind;
        const target = kind ? findBranchTarget(p, kind) : null;
        if (target) {
          const tol = Math.max(
            mmToPx(dimensionDiameterMm(target.line.dimension), scale.metersPerPixel),
            16 * invScale,
          );
          const endpointHit = endpointHitOf(target.line, target.x, target.y, tol);
          const isContinue = !!endpointHit && target.line.subId === activeSubId;
          setHoverSnap({ line: target.line, x: target.x, y: target.y, kind: isContinue ? 'continue' : 'branch' });
        } else {
          setHoverSnap(null);
        }
      } else if (isSymbolTool) {
        let best: { line: LineEntity; x: number; y: number; distance: number } | null = null;
        for (const line of lines) {
          if (line.page !== currentPage) continue;
          const cp = closestPointOnPolyline(line.points, p);
          if (!cp) continue;
          const dimMm = dimensionDiameterMm(line.dimension);
          const tol = Math.max(mmToPx(dimMm, scale.metersPerPixel), 16 * invScale);
          if (cp.distance <= tol && (!best || cp.distance < best.distance)) {
            best = { line, x: cp.x, y: cp.y, distance: cp.distance };
          }
        }
        setHoverSnap(best ? { line: best.line, x: best.x, y: best.y, kind: 'mount' } : null);
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
      const p = getImagePoint();
      if (!p) return;
      // Nærmeste rør ELLER kanal innenfor bredde-toleransen (ingen kind-filter).
      let best: { line: LineEntity; x: number; y: number; distance: number; angleDeg: number } | null = null;
      for (const line of lines) {
        if (line.page !== currentPage) continue;
        const cp = closestPointOnPolyline(line.points, p);
        if (!cp) continue;
        const dimMm = dimensionDiameterMm(line.dimension);
        const tol = Math.max(mmToPx(dimMm, scale.metersPerPixel), 16 * invScale);
        if (cp.distance <= tol && (!best || cp.distance < best.distance)) {
          best = { line, x: cp.x, y: cp.y, distance: cp.distance, angleDeg: cp.angleDeg };
        }
      }
      if (best) addClamp(best.line.id, best.x, best.y, best.angleDeg, best.line.dimension);
    },
    [getImagePoint, lines, currentPage, scale.metersPerPixel, invScale, addClamp],
  );

  const cursorStyle =
    isPan || isSpacePan
      ? 'grab'
      : isLineTool || isSymbolTool || isAnnotationTool || isMeasureTool || tool === 'calibrate'
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
        const def = SYMBOL_DEFS[symType];
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

      {showShiftTip && isLineTool && activeMaterial && (
        <div className="shift-tip">
          <Lightbulb size={15} className="shift-tip-icon" />
          <span className="shift-tip-text">
            Hold <strong>Shift</strong> inne for å snappe til rett linje/standardvinkler. {activeMaterial}{' '}
            støtter: {activeBendAngles.map((a) => `${a}°`).join(', ')}.
          </span>
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
          {visibleLines
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
                onChange={(pts) => updateLinePoints(line.id, pts)}
                onMove={(dx, dy) => moveSingleLine(line.id, dx, dy, true)}
                onExtend={(fromStart) => seedContinuation(line, fromStart)}
                onSplit={(x, y) => splitLineAt(line.id, x, y)}
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
              interactive={tool === 'select'}
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
              interactive={tool === 'select'}
              onSelect={() => select(b.id, 'branch')}
            />
          ))}
          {pageBends.map((b) => (
            <BendMarker
              key={b.id}
              bend={b}
              invScale={invScale}
              selected={b.id === selectedId || multiSelection.has(b.id)}
              interactive={tool === 'select'}
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
          {isMeasureTool && measureSnapKind && cursor && (
            <Group x={cursor.x} y={cursor.y}>
              <Circle
                radius={7 * invScale}
                stroke={measureSnapKind === 'close' ? '#2f9e44' : '#7c4dff'}
                strokeWidth={1.5 * invScale}
                fill="#fff"
              />
              <Circle radius={2 * invScale} fill={measureSnapKind === 'close' ? '#2f9e44' : '#7c4dff'} />
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
                fill={measureSnapKind === 'close' ? '#2f9e44' : '#7c4dff'}
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
              fill="rgba(76,154,255,0.12)"
              stroke="#4c9aff"
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
          {hoverSnap && (
            <>
              <Line
                points={hoverSnap.line.points}
                stroke="#4c9aff"
                strokeWidth={10 * invScale}
                opacity={0.35}
                lineCap="round"
                lineJoin="round"
              />
              <Group x={hoverSnap.x} y={hoverSnap.y}>
                <Circle radius={6 * invScale} fill="#4c9aff" opacity={0.9} />
                <Text
                  x={10 * invScale}
                  y={-18 * invScale}
                  text={
                    hoverSnap.kind === 'continue'
                      ? 'Fortsetter røret'
                      : hoverSnap.kind === 'branch'
                        ? 'Ny avgreining'
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
  onChange: (points: number[]) => void;
  /** Flytter hele linjen (kropp-dra) med (dx,dy) – strekker tilkoblede naboer og drar
   * med skjøt-markører/monterte symboler, i motsetning til onChange som kun endrer
   * denne linjens egne punkter (brukt av knekkpunkt-håndtakene). */
  onMove: (dx: number, dy: number) => void;
  onExtend: (fromStart: boolean) => void;
  /** Splitter et rett segment i to ved et gitt punkt (klikk på midtpunkt-håndtaket) –
   * brukes til å manuelt legge til et knekkpunkt på et allerede tegnet strekk. */
  onSplit: (x: number, y: number) => void;
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
  onChange,
  onMove,
  onExtend,
  onSplit,
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

  function setVertex(i: number, x: number, y: number) {
    const next = line.points.slice();
    next[i] = x;
    next[i + 1] = y;
    onChange(next);
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
          e.cancelBubble = true;
          if (e.evt.shiftKey) onToggleMultiSelect();
          else onSelect();
        }}
        onTap={onSelect}
        onDragEnd={(e) => {
          const node = e.target;
          const dx = node.x();
          const dy = node.y();
          node.position({ x: 0, y: 0 });
          // Flytt kun denne kanalen; naboer strekkes og komponenter følger med.
          onMove(dx, dy);
        }}
      />
      {bends.map((b, i) => (
        <BendBadge key={i} x={b.x} y={b.y} angleDeg={classifyBendAngle(b.angleDeg)} invScale={invScale} />
      ))}

      {/* Knekkpunkt- og midtpunkt-håndtak for redigering av tegnede rør/kanaler */}
      {selected &&
        editable &&
        Array.from({ length: line.points.length / 2 - 1 }, (_, segIndex) => {
          const x0 = line.points[segIndex * 2];
          const y0 = line.points[segIndex * 2 + 1];
          const x1 = line.points[segIndex * 2 + 2];
          const y1 = line.points[segIndex * 2 + 3];
          return (
            <Circle
              key={`mid-${segIndex}`}
              x={(x0 + x1) / 2}
              y={(y0 + y1) / 2}
              radius={4 * invScale}
              fill="rgba(245,166,35,0.5)"
              stroke="#f5a623"
              strokeWidth={1 * invScale}
              onMouseDown={(e) => {
                e.cancelBubble = true;
              }}
              onClick={(e) => {
                e.cancelBubble = true;
                onSplit((x0 + x1) / 2, (y0 + y1) / 2);
              }}
            />
          );
        })}
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
              onDragMove={(e) => setVertex(idx, e.target.x(), e.target.y())}
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
        radius={Math.max(r + 6 * invScale, 14 * invScale)}
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
}: {
  branch: BranchEntity;
  invScale: number;
  selected: boolean;
  hideLabel: boolean;
  interactive: boolean;
  onSelect: () => void;
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
        radius={Math.max(r + 6 * invScale, 14 * invScale)}
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
        radius={12 * invScale}
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
      const widthMm = Number(sym.props.width) || 2000;
      const lengthMm = Number(sym.props.length) || 1200;
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
  onSelect,
  onChange,
  onHover,
}: SymbolNodeProps) {
  return (
    <Group
      x={sym.x}
      y={sym.y}
      rotation={sym.rotation}
      scaleX={nodeScale.scaleX}
      scaleY={nodeScale.scaleY}
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
      <SymbolGlyph type={sym.type} selected={selected} showArrows={showAirflowArrows} color={color} />
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
