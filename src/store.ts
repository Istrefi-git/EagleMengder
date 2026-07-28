import { create } from 'zustand';
import type {
  AnnotationEntity,
  AnnotationType,
  BendEntity,
  BranchEntity,
  BranchFittingType,
  ClampEntity,
  LineEntity,
  MeasurementEntity,
  MeasurementType,
  PipeRenderStyle,
  ScaleState,
  SymbolEntity,
  SymbolType,
  TagEntity,
  Theme,
  ToolMode,
  TransitionEntity,
} from './types';
import type { GroupBy, SortBy, SortDir } from './lib/quantityGroups';
import {
  CLAMP_ROD_LENGTH_MM,
  DEFAULT_CLAMP_ROD_DIAMETER,
  DEFAULT_CLAMP_SPACING,
  DEFAULT_PIPE_RENDER_STYLE,
  DEFAULT_STANDARD_LENGTHS,
  DEFAULT_THEME,
  SUBCATEGORIES,
  categoryOf,
  defaultSymbolProps,
} from './types';
import type { PdfDoc } from './lib/pdf';
import { detectScaleFromPdf } from './lib/pdf';
import { classifyBendAngle, closestPointOnPolyline, lineIntersect, polylineBendAngles } from './lib/geometry';
import { dimensionDiameterMm } from './lib/dimension';
import { mmToPx } from './lib/scale';

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${idCounter++}`;

/** Finner alle linjer som er transitivt forbundet med et sett med start-id-er, via delte
 * endepunkter (samme koordinat innenfor toleranse) – brukes til å flytte en hel
 * sammenhengende rør-/kanalstrekning som én rigid enhet (se nudgeSelected), slik at
 * skjøtene ikke ryker når man flytter et enkelt segment med piltastene. */
function findConnectedLineIds(pageLines: LineEntity[], seedIds: string[], eps = 0.5): Set<string> {
  const endpointsOf = (l: LineEntity) => {
    const n = l.points.length;
    return [
      { x: l.points[0], y: l.points[1] },
      { x: l.points[n - 2], y: l.points[n - 1] },
    ];
  };
  const visited = new Set<string>();
  const queue = [...seedIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const line = pageLines.find((l) => l.id === id);
    if (!line) continue;
    const pts = endpointsOf(line);
    for (const other of pageLines) {
      if (visited.has(other.id)) continue;
      const otherPts = endpointsOf(other);
      const shares = pts.some((p) => otherPts.some((op) => Math.abs(p.x - op.x) < eps && Math.abs(p.y - op.y) < eps));
      if (shares) queue.push(other.id);
    }
  }
  return visited;
}

const JOINT_EPS = 0.5;

/** Sørger for at hver RENE skjøt (nøyaktig to segmenter møtes) på de endrede linjene
 * har en overgang når dimensjonene er ulike – og ingen når de er like. Idempotent: en
 * eksisterende overgang i skjøten oppdateres i stedet for at det lages en ny, så
 * gjentatte dimensjonsbytter ikke gir duplikater. Brukes av `updateLineProps`/
 * `updateManyLineProps` etter en dimensjons-/underkategoriendring – typisk rett etter
 * at «Del»-verktøyet har delt en kanal og brukeren endrer dimensjon på den ene
 * halvdelen. Samme prinsipp som `seedContinuation` (PdfCanvas.tsx) allerede bruker når
 * en fortsettelse får en annen dimensjon enn røret den fortsetter fra – her generalisert
 * til å gjelde ETTERPÅ-endringer også, ikke bare i det øyeblikket linjen tegnes.
 * Tre eller flere segmenter i samme punkt er en avgreining (har alt sin egen del) og
 * behandles bevisst ikke her. */
function syncTransitionsAtJoints(
  lines: LineEntity[],
  transitions: TransitionEntity[],
  currentPage: number,
  changedIds: Set<string>,
): TransitionEntity[] {
  const pageLines = lines.filter((l) => l.page === currentPage);
  let out = transitions;
  for (const line of pageLines) {
    if (!changedIds.has(line.id)) continue;
    const n = line.points.length;
    const joints: [number, number][] = [
      [line.points[0], line.points[1]],
      [line.points[n - 2], line.points[n - 1]],
    ];
    for (const [jx, jy] of joints) {
      const at = pageLines.filter((l) => {
        const m = l.points.length;
        return (
          (Math.abs(l.points[0] - jx) < JOINT_EPS && Math.abs(l.points[1] - jy) < JOINT_EPS) ||
          (Math.abs(l.points[m - 2] - jx) < JOINT_EPS && Math.abs(l.points[m - 1] - jy) < JOINT_EPS)
        );
      });
      if (at.length !== 2) continue; // 1 = fri ende, ≥3 = avgreining – ikke en overgang
      const other = at.find((l) => l.id !== line.id);
      if (!other || other.subId !== line.subId || other.material !== line.material) continue;

      const i = out.findIndex(
        (t) =>
          t.page === line.page &&
          t.subId === line.subId &&
          Math.abs(t.x - jx) < JOINT_EPS &&
          Math.abs(t.y - jy) < JOINT_EPS,
      );
      if (other.dimension === line.dimension) {
        // Ikke lenger en dimensjonsendring → fjern en ev. overgang, ellers ville
        // mengdelisten fått en meningsløs «Ø200 → Ø200»-rad.
        if (i >= 0) out = out.filter((_, k) => k !== i);
        continue;
      }
      const patch = {
        subId: line.subId,
        material: line.material,
        fromDimension: other.dimension,
        toDimension: line.dimension,
        x: jx,
        y: jy,
      };
      out =
        i >= 0
          ? out.map((t, k) => (k === i ? { ...t, ...patch } : t))
          : [...out, { id: nextId('trans'), page: line.page, ...patch }];
    }
  }
  return out;
}

/** Hva et flytte-/kopier-steg (Flytt/Kopier-verktøyet, eller piltastene) skal virke på.
 * `planMove` regner ut id-settene ÉN gang ved gest-start (den kostbare
 * sammenhengs-analysen kjøres ikke på nytt for hver musebevegelse); `applyMovePlan`
 * er en ren funksjon som brukes av BÅDE spøkelses-forhåndsvisningen og selve
 * commit-en, slik at de aldri kan vise/gjøre forskjellige ting. */
export interface MovePlan {
  /** 'single' = nøyaktig én linje valgt → vinkelbevarende semantikk (moveSingleLine).
   * 'rigid' = alt annet → hele den sammenhengende strekningen + resten av utvalget
   * translateres rigid (nudgeSelected-semantikk). */
  mode: 'single' | 'rigid';
  /** Kun for 'single'. */
  lineId?: string;
  /** Linjer som flyttes (for 'single': kun lineId selv). */
  lineIds: Set<string>;
  bendIds: Set<string>;
  transitionIds: Set<string>;
  branchIds: Set<string>;
  tagIds: Set<string>;
  symbolIds: Set<string>;
  clampIds: Set<string>;
  annotationIds: Set<string>;
  measurementIds: Set<string>;
}

/** Delmengden av AppState som planMove/applyMovePlan faktisk trenger. Holdt smalt
 * (i stedet for hele AppState) slik at PdfCanvas' spøkelses-forhåndsvisning kan bygge
 * et lett øyeblikksbilde fra sine egne `useStore`-selektorer, uten å måtte late som om
 * den har alle de 130+ feltene på det fulle AppState. */
export type MoveSourceState = Pick<
  AppState,
  | 'lines'
  | 'symbols'
  | 'transitions'
  | 'branches'
  | 'bends'
  | 'annotations'
  | 'tags'
  | 'clamps'
  | 'measurements'
  | 'currentPage'
  | 'scale'
  | 'multiSelection'
  | 'selectedId'
  | 'selectedKind'
>;

/** Bestemmer HVA som skal flyttes/kopieres for gjeldende utvalg. Speiler den gamle
 * nudgeSelected-seedingen, men tetter tre hull: (1) markører midt på kroppen til en
 * flyttet linje følger med (samme onBody-idiom som moveSingleLine bruker til vanlig
 * piltast-flytting av én linje), (2) frittstående valgte symboler/tagger/klammer/
 * annotasjoner/målinger flyttes også – ikke bare de som henger på en flyttet linje, og
 * (3) et utvalg helt uten linjer gir fortsatt en gyldig plan. */
export function planMove(s: MoveSourceState, opts: { forceRigid?: boolean } = {}): MovePlan | null {
  const ids = new Set(s.multiSelection);
  if (s.selectedId) ids.add(s.selectedId);
  if (ids.size === 0) return null;

  const pageLines = s.lines.filter((l) => l.page === s.currentPage);
  const seedLineIds = Array.from(ids).filter((id) => pageLines.some((l) => l.id === id));

  // Vinkelbevarende én-linje-semantikk kun når AKKURAT ÉN linje er valgt via selectedId
  // (ingen flervalg) – speiler nøyaktig det gamle skillet i piltast-håndteringen
  // (`multiSelection.size === 0 && selectedKind === 'line'`). Et flervalg som
  // tilfeldigvis bare inneholder én linje (f.eks. et gummibånd rundt ett segment)
  // skal fortsatt gi rigid strekningsflytting, akkurat som nudgeSelected alltid har
  // gjort – derav sjekken på `s.multiSelection.size === 0`, ikke bare antall id-er.
  // `forceRigid` lar nudgeSelected eksplisitt be om rigid modus uansett.
  if (!opts.forceRigid && s.multiSelection.size === 0 && seedLineIds.length === 1) {
    return {
      mode: 'single',
      lineId: seedLineIds[0],
      lineIds: new Set(seedLineIds),
      bendIds: new Set(),
      transitionIds: new Set(),
      branchIds: new Set(),
      tagIds: new Set(),
      symbolIds: new Set(),
      clampIds: new Set(),
      annotationIds: new Set(),
      measurementIds: new Set(),
    };
  }

  const lineIds = findConnectedLineIds(pageLines, seedLineIds);
  const movingLines = pageLines.filter((l) => lineIds.has(l.id));

  // Alle punkter (før flytting) på linjene som flyttes – brukes til å finne hvilke
  // bend-/overgang-/avgreiningsmarkører som satt akkurat på disse skjøtene.
  const oldPoints: { x: number; y: number }[] = [];
  for (const l of movingLines) {
    for (let i = 0; i + 1 < l.points.length; i += 2) oldPoints.push({ x: l.points[i], y: l.points[i + 1] });
  }
  const nearOld = (x: number, y: number, eps = 0.5) =>
    oldPoints.some((p) => Math.abs(p.x - x) < eps && Math.abs(p.y - y) < eps);

  // Mid-kropp-markører (påstikk/overganger) på en av de flyttede linjene – samme
  // halvbredde-idiom som moveSingleLine sin onBody, sjekket mot ALLE flyttede linjer.
  const onBodyOfMoving = (x: number, y: number, subId: string, material: string): boolean =>
    movingLines.some((l) => {
      if (l.subId !== subId || l.material !== material) return false;
      const halfW = Math.max(mmToPx(dimensionDiameterMm(l.dimension), s.scale.metersPerPixel) / 2, 4);
      const cp = closestPointOnPolyline(l.points, { x, y });
      return cp != null && cp.distance <= halfW;
    });

  const onPage = <T extends { page: number }>(arr: T[]) => arr.filter((e) => e.page === s.currentPage);

  const bendIds = new Set(
    onPage(s.bends)
      .filter((b) => ids.has(b.id) || nearOld(b.x, b.y))
      .map((b) => b.id),
  );
  const transitionIds = new Set(
    onPage(s.transitions)
      .filter((t) => ids.has(t.id) || nearOld(t.x, t.y) || onBodyOfMoving(t.x, t.y, t.subId, t.material))
      .map((t) => t.id),
  );
  const branchIds = new Set(
    onPage(s.branches)
      .filter((b) => ids.has(b.id) || nearOld(b.x, b.y) || onBodyOfMoving(b.x, b.y, b.subId, b.material))
      .map((b) => b.id),
  );
  const tagIds = new Set(
    onPage(s.tags)
      .filter((t) => ids.has(t.id) || lineIds.has(t.lineId))
      .map((t) => t.id),
  );
  const symbolIds = new Set(
    onPage(s.symbols)
      .filter((sy) => ids.has(sy.id) || (sy.mountedLineId != null && lineIds.has(sy.mountedLineId)))
      .map((sy) => sy.id),
  );
  const clampIds = new Set(
    onPage(s.clamps)
      .filter((c) => ids.has(c.id) || lineIds.has(c.lineId))
      .map((c) => c.id),
  );
  const annotationIds = new Set(
    onPage(s.annotations)
      .filter((a) => ids.has(a.id))
      .map((a) => a.id),
  );
  const measurementIds = new Set(
    onPage(s.measurements)
      .filter((m) => ids.has(m.id))
      .map((m) => m.id),
  );

  if (
    lineIds.size === 0 &&
    bendIds.size === 0 &&
    transitionIds.size === 0 &&
    branchIds.size === 0 &&
    tagIds.size === 0 &&
    symbolIds.size === 0 &&
    clampIds.size === 0 &&
    annotationIds.size === 0 &&
    measurementIds.size === 0
  ) {
    return null;
  }

  return {
    mode: 'rigid',
    lineIds,
    bendIds,
    transitionIds,
    branchIds,
    tagIds,
    symbolIds,
    clampIds,
    annotationIds,
    measurementIds,
  };
}

type MoveDrawPatch = Pick<
  AppState,
  'lines' | 'symbols' | 'transitions' | 'branches' | 'bends' | 'tags' | 'clamps' | 'annotations' | 'measurements'
>;

/** Ren funksjon: regner ut hvordan tegnedataene ser ut etter at `plan` er forskjøvet
 * med (dx,dy) – uten å mutere state. Brukes for både spøkelses-forhåndsvisningen
 * (matet med det rå utvalget) og selve commit-en (via moveSelection). */
export function applyMovePlan(s: MoveSourceState, plan: MovePlan, dx: number, dy: number): MoveDrawPatch {
  if (plan.mode === 'single' && plan.lineId) {
    return applySingleLineMove(s, plan.lineId, dx, dy);
  }

  const { lineIds, bendIds, transitionIds, branchIds, tagIds, symbolIds, clampIds, annotationIds, measurementIds } =
    plan;
  const shift = (pts: number[]) => pts.map((v, i) => (i % 2 === 0 ? v + dx : v + dy));

  return {
    lines: s.lines.map((l) => (lineIds.has(l.id) ? { ...l, points: shift(l.points) } : l)),
    bends: s.bends.map((b) => (bendIds.has(b.id) ? { ...b, x: b.x + dx, y: b.y + dy } : b)),
    transitions: s.transitions.map((t) => (transitionIds.has(t.id) ? { ...t, x: t.x + dx, y: t.y + dy } : t)),
    branches: s.branches.map((b) => (branchIds.has(b.id) ? { ...b, x: b.x + dx, y: b.y + dy } : b)),
    tags: s.tags.map((t) =>
      tagIds.has(t.id) ? { ...t, x: t.x + dx, y: t.y + dy, labelX: t.labelX + dx, labelY: t.labelY + dy } : t,
    ),
    symbols: s.symbols.map((sy) => (symbolIds.has(sy.id) ? { ...sy, x: sy.x + dx, y: sy.y + dy } : sy)),
    clamps: s.clamps.map((c) => (clampIds.has(c.id) ? { ...c, x: c.x + dx, y: c.y + dy } : c)),
    annotations: s.annotations.map((a) => {
      if (!annotationIds.has(a.id)) return a;
      return {
        ...a,
        x: a.x + dx,
        y: a.y + dy,
        anchorX: a.anchorX != null ? a.anchorX + dx : undefined,
        anchorY: a.anchorY != null ? a.anchorY + dy : undefined,
        points: a.points ? shift(a.points) : undefined,
      };
    }),
    measurements: s.measurements.map((m) => (measurementIds.has(m.id) ? { ...m, points: shift(m.points) } : m)),
  };
}

/** Vinkelbevarende flytting av én enkelt linje: linjen selv beholder sin retning
 * (translateres), mens naboer beholder SIN retning – kun det delte skjøtpunktet
 * flyttes til skjæringen mellom de to linjene. Dette er selve algoritmen som lå i
 * moveSingleLine; trukket ut hit som en ren funksjon slik at Flytt-verktøyets
 * spøkelses-forhåndsvisning kan bruke nøyaktig samme utregning som commit-en. */
function applySingleLineMove(s: MoveSourceState, lineId: string, dx: number, dy: number): MoveDrawPatch {
  const line = s.lines.find((l) => l.id === lineId && l.page === s.currentPage);
  if (!line) {
    return {
      lines: s.lines,
      symbols: s.symbols,
      transitions: s.transitions,
      branches: s.branches,
      bends: s.bends,
      tags: s.tags,
      clamps: s.clamps,
      annotations: s.annotations,
      measurements: s.measurements,
    };
  }

  const pageLines = s.lines.filter((l) => l.page === line.page);
  const eps = 0.5;
  const near = (ax: number, ay: number, bx: number, by: number) =>
    Math.abs(ax - bx) < eps && Math.abs(ay - by) < eps;

  // Retningen til linjen som flyttes (ende-til-ende). Etter flytting skal L beholde
  // denne retningen (L-ny-linje = L translatert med (dx,dy)), slik at vinkelen mot
  // naboene ikke endres.
  const n = line.points.length;
  const dirL = { x: line.points[n - 2] - line.points[0], y: line.points[n - 1] - line.points[1] };
  const oldEndpoints = [
    { x: line.points[0], y: line.points[1] },
    { x: line.points[n - 2], y: line.points[n - 1] },
  ];

  // For hvert endepunkt E på L: beregn hvor E havner (newEndpoint), og hvilke
  // nabo-vertekser som skal flyttes dit. Naboer beholder sin egen retning – kun deres
  // delte skjøt følger med – slik at bend-vinklene bevares nøyaktig.
  const newEndpoint = oldEndpoints.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  const neighborMoves: { lineId: string; vertexIndex: number; x: number; y: number }[] = [];

  oldEndpoints.forEach((E, k) => {
    const neighbors: { line: LineEntity; vertexIndex: number }[] = [];
    for (const other of pageLines) {
      if (other.id === lineId) continue;
      const on = other.points.length;
      for (const i of [0, on - 2]) {
        if (near(other.points[i], other.points[i + 1], E.x, E.y)) {
          neighbors.push({ line: other, vertexIndex: i });
        }
      }
    }

    if (neighbors.length === 1) {
      const nb = neighbors[0];
      const nn = nb.line.points.length;
      // Naboens faste fjern-ende (motsatt av skjøten) og dens opprinnelige retning.
      const sharedIsStart = nb.vertexIndex === 0;
      const farX = sharedIsStart ? nb.line.points[nn - 2] : nb.line.points[0];
      const farY = sharedIsStart ? nb.line.points[nn - 1] : nb.line.points[1];
      const dirN = { x: E.x - farX, y: E.y - farY };
      // Nytt skjøtpunkt = skjæring mellom L-ny-linje og naboens faste linje.
      const hit = lineIntersect({ x: E.x + dx, y: E.y + dy }, dirL, { x: farX, y: farY }, dirN);
      const target = hit ?? { x: E.x + dx, y: E.y + dy }; // fallback: parallell/kolineær → strekk
      newEndpoint[k] = target;
      neighborMoves.push({ lineId: nb.line.id, vertexIndex: nb.vertexIndex, x: target.x, y: target.y });
    } else if (neighbors.length >= 2) {
      // T-rør/forgrening: bevar ikke vinkel – flytt skjøten og dra alle naboer dit.
      for (const nb of neighbors) {
        neighborMoves.push({ lineId: nb.line.id, vertexIndex: nb.vertexIndex, x: E.x + dx, y: E.y + dy });
      }
      newEndpoint[k] = { x: E.x + dx, y: E.y + dy };
    }
    // neighbors.length === 0 → fri ende: newEndpoint[k] er allerede E+(dx,dy).
  });

  const movesByLine = new Map<string, { vertexIndex: number; x: number; y: number }[]>();
  for (const m of neighborMoves) {
    const arr = movesByLine.get(m.lineId) ?? [];
    arr.push({ vertexIndex: m.vertexIndex, x: m.x, y: m.y });
    movesByLine.set(m.lineId, arr);
  }

  // Hvor havner et gammelt skjøtpunkt? Brukt for å flytte markører til det NYE
  // skjøtpunktet (ikke bare med (dx,dy)), slik at de blir liggende riktig.
  const remap = (x: number, y: number): { x: number; y: number } | null => {
    for (let k = 0; k < oldEndpoints.length; k++) {
      if (near(oldEndpoints[k].x, oldEndpoints[k].y, x, y)) return newEndpoint[k];
    }
    return null;
  };

  // Påstikk/overganger sitter ofte MIDT PÅ kroppen til den flyttede linjen (ikke i et
  // endepunkt), så `remap` alene fanger dem ikke – de ville blitt liggende igjen mens
  // kanalen gled ut under dem. Test derfor (mot linjens GAMLE geometri, før flytting)
  // om markøren ligger på selve kroppen, innenfor en halv rørbredde + margin, og krev
  // samme subId/material for å unngå å plukke opp en markør på en parallell nabo-kanal.
  const halfW = Math.max(mmToPx(dimensionDiameterMm(line.dimension), s.scale.metersPerPixel) / 2, 4);
  const onBody = (x: number, y: number, subId: string, material: string): boolean => {
    if (subId !== line.subId || material !== line.material) return false;
    const cp = closestPointOnPolyline(line.points, { x, y });
    return cp != null && cp.distance <= halfW;
  };

  return {
    lines: s.lines.map((l) => {
      if (l.id === lineId) {
        // Endepunktene settes til newEndpoint (skjæring eller translatert) – begge ligger
        // på L-ny-linje, så L beholder retningen. Ev. indre punkter translateres.
        const pts = [...l.points];
        pts[0] = newEndpoint[0].x;
        pts[1] = newEndpoint[0].y;
        pts[pts.length - 2] = newEndpoint[1].x;
        pts[pts.length - 1] = newEndpoint[1].y;
        for (let i = 2; i + 1 < pts.length - 2; i += 2) {
          pts[i] += dx;
          pts[i + 1] += dy;
        }
        return { ...l, points: pts };
      }
      const moves = movesByLine.get(l.id);
      if (!moves) return l;
      const pts = [...l.points];
      for (const mv of moves) {
        pts[mv.vertexIndex] = mv.x;
        pts[mv.vertexIndex + 1] = mv.y;
      }
      return { ...l, points: pts };
    }),
    // Skjøt-markører flyttes til det nye skjøtpunktet (vinkel bevart ⇒ angleDeg gyldig).
    bends: s.bends.map((b) => {
      const r = remap(b.x, b.y);
      return r ? { ...b, x: r.x, y: r.y } : b;
    }),
    transitions: s.transitions.map((t) => {
      const r = remap(t.x, t.y);
      if (r) return { ...t, x: r.x, y: r.y };
      return onBody(t.x, t.y, t.subId, t.material) ? { ...t, x: t.x + dx, y: t.y + dy } : t;
    }),
    branches: s.branches.map((b) => {
      const r = remap(b.x, b.y);
      if (r) return { ...b, x: r.x, y: r.y };
      return onBody(b.x, b.y, b.subId, b.material) ? { ...b, x: b.x + dx, y: b.y + dy } : b;
    }),
    // Tagger og montert utstyr på den flyttede linjen følger med.
    tags: s.tags.map((t) =>
      t.lineId === lineId ? { ...t, x: t.x + dx, y: t.y + dy, labelX: t.labelX + dx, labelY: t.labelY + dy } : t,
    ),
    symbols: s.symbols.map((sy) => (sy.mountedLineId === lineId ? { ...sy, x: sy.x + dx, y: sy.y + dy } : sy)),
    clamps: s.clamps.map((c) => (c.lineId === lineId ? { ...c, x: c.x + dx, y: c.y + dy } : c)),
    annotations: s.annotations,
    measurements: s.measurements,
  };
}

export interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

export type SelectedKind =
  | 'line'
  | 'symbol'
  | 'branch'
  | 'transition'
  | 'annotation'
  | 'bend'
  | 'tag'
  | 'clamp'
  | 'measurement'
  | null;

export interface PendingBranchChoice {
  mainSubId: string;
  mainMaterial: string;
  mainDimension: string;
  branchDimension: string;
  x: number;
  y: number;
  angleDeg: number;
  /** Satt når popoveren redigerer en EKSISTERENDE avgreining (dobbeltklikk på
   * markøren) i stedet for å opprette en ny – se resolvePendingBranchChoice. */
  editId?: string;
  /** Gjeldende type ved redigering (kun satt sammen med editId), brukt til å
   * markere den aktive knappen i BranchChoicePopover. */
  currentFittingType?: BranchFittingType;
}

/** Tegnedata som angre/gjenta opererer på – verktøy/visning/tema er bevisst utelatt. */
export interface DrawSnapshot {
  lines: LineEntity[];
  symbols: SymbolEntity[];
  transitions: TransitionEntity[];
  branches: BranchEntity[];
  bends: BendEntity[];
  annotations: AnnotationEntity[];
  tags: TagEntity[];
  clamps: ClampEntity[];
  measurements: MeasurementEntity[];
}

const MAX_HISTORY = 50;

const SETTINGS_KEY = 'mengdemaler-settings';

interface PersistedSettings {
  pipe: number;
  duct: number;
  pipeRenderStyle: PipeRenderStyle;
  theme: Theme;
  showAirflowArrows: boolean;
  /** Skjul tekst-etiketter for komponenter (overganger/avgreininger) på lerretet. */
  hideComponentLabels: boolean;
  suppressOffLineWarning: boolean;
  customSystems: string[];
  /** Egendefinerte dimensjoner lagt til per underkategori (f.eks. runde Ø-mål eller
   * rektangulære BxH-mål for kanaler som ikke finnes i standardsettet). */
  customDimensions: Record<string, string[]>;
  /** Egendefinerte farger per underkategori (subId → hex), overstyrer standardfargen
   * i CATEGORIES-katalogen. */
  customColors: Record<string, string>;
  /** Sett inn klammer/gjengestag automatisk på nye kanaler/rør som tegnes. */
  autoInsertClamps: boolean;
  /** Avstand (mm) mellom klammer, per bygningsdel-type. */
  clampSpacing: { pipe: number; duct: number };
  /** Standard gjengestag-diameter (mm) for nye klammer. */
  clampRodDiameter: number;
  /** Standard gjengestag-lengde (mm) for nye klammer. */
  clampRodLengthMm: number;
  /** Gruppering/sortering av mengdelista – gjelder også Excel/PDF-eksport, se quantityGroups.ts. */
  quantityGroupBy: GroupBy;
  quantitySortBy: SortBy;
  quantitySortDir: SortDir;
}

function loadSettings(): PersistedSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw);
    return {
      pipe: typeof parsed.pipe === 'number' ? parsed.pipe : DEFAULT_STANDARD_LENGTHS.pipe,
      duct: typeof parsed.duct === 'number' ? parsed.duct : DEFAULT_STANDARD_LENGTHS.duct,
      pipeRenderStyle:
        parsed.pipeRenderStyle === 'flat' || parsed.pipeRenderStyle === 'cylinder'
          ? parsed.pipeRenderStyle
          : DEFAULT_PIPE_RENDER_STYLE,
      theme: parsed.theme === 'dark' ? 'dark' : DEFAULT_THEME,
      showAirflowArrows: typeof parsed.showAirflowArrows === 'boolean' ? parsed.showAirflowArrows : true,
      hideComponentLabels:
        typeof parsed.hideComponentLabels === 'boolean' ? parsed.hideComponentLabels : false,
      suppressOffLineWarning:
        typeof parsed.suppressOffLineWarning === 'boolean' ? parsed.suppressOffLineWarning : false,
      customSystems: Array.isArray(parsed.customSystems)
        ? parsed.customSystems.filter((c: unknown) => typeof c === 'string')
        : [],
      customDimensions:
        parsed.customDimensions && typeof parsed.customDimensions === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.customDimensions as Record<string, unknown>).filter(
                (entry): entry is [string, string[]] =>
                  Array.isArray(entry[1]) && entry[1].every((d) => typeof d === 'string'),
              ),
            )
          : {},
      customColors:
        parsed.customColors && typeof parsed.customColors === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.customColors as Record<string, unknown>).filter(
                (entry): entry is [string, string] => typeof entry[1] === 'string',
              ),
            )
          : {},
      autoInsertClamps: typeof parsed.autoInsertClamps === 'boolean' ? parsed.autoInsertClamps : false,
      clampSpacing: {
        pipe:
          parsed.clampSpacing && typeof parsed.clampSpacing.pipe === 'number'
            ? parsed.clampSpacing.pipe
            : DEFAULT_CLAMP_SPACING.pipe,
        duct:
          parsed.clampSpacing && typeof parsed.clampSpacing.duct === 'number'
            ? parsed.clampSpacing.duct
            : DEFAULT_CLAMP_SPACING.duct,
      },
      clampRodDiameter:
        typeof parsed.clampRodDiameter === 'number' ? parsed.clampRodDiameter : DEFAULT_CLAMP_ROD_DIAMETER,
      clampRodLengthMm: typeof parsed.clampRodLengthMm === 'number' ? parsed.clampRodLengthMm : CLAMP_ROD_LENGTH_MM,
      quantityGroupBy:
        parsed.quantityGroupBy === 'dimension' || parsed.quantityGroupBy === 'material'
          ? parsed.quantityGroupBy
          : 'system',
      quantitySortBy:
        parsed.quantitySortBy === 'length' || parsed.quantitySortBy === 'count' ? parsed.quantitySortBy : 'name',
      quantitySortDir: parsed.quantitySortDir === 'desc' ? 'desc' : 'asc',
    };
  } catch {
    return defaultSettings();
  }
}

function defaultSettings(): PersistedSettings {
  return {
    ...DEFAULT_STANDARD_LENGTHS,
    pipeRenderStyle: DEFAULT_PIPE_RENDER_STYLE,
    theme: DEFAULT_THEME,
    showAirflowArrows: true,
    hideComponentLabels: false,
    suppressOffLineWarning: false,
    customSystems: [],
    customDimensions: {},
    customColors: {},
    autoInsertClamps: false,
    clampSpacing: { ...DEFAULT_CLAMP_SPACING },
    clampRodDiameter: DEFAULT_CLAMP_ROD_DIAMETER,
    clampRodLengthMm: CLAMP_ROD_LENGTH_MM,
    quantityGroupBy: 'system',
    quantitySortBy: 'name',
    quantitySortDir: 'asc',
  };
}

function saveSettings(settings: PersistedSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignorer (f.eks. privat nettlesing uten lagringstilgang)
  }
}

/** Bygger og lagrer hele settings-blob-en fra nåværende state, med ev. felt overstyrt –
 * brukes av alle setters under så hver av dem ikke selv må huske å spre inn alle feltene. */
function persistSettings(s: AppState, overrides: Partial<PersistedSettings> = {}) {
  saveSettings({
    pipe: s.standardLengths.pipe,
    duct: s.standardLengths.duct,
    pipeRenderStyle: s.pipeRenderStyle,
    theme: s.theme,
    showAirflowArrows: s.showAirflowArrows,
    hideComponentLabels: s.hideComponentLabels,
    suppressOffLineWarning: s.suppressOffLineWarning,
    customSystems: s.customSystems,
    customDimensions: s.customDimensions,
    customColors: s.customColors,
    autoInsertClamps: s.autoInsertClamps,
    clampSpacing: s.clampSpacing,
    clampRodDiameter: s.clampRodDiameter,
    clampRodLengthMm: s.clampRodLengthMm,
    quantityGroupBy: s.quantityGroupBy,
    quantitySortBy: s.quantitySortBy,
    quantitySortDir: s.quantitySortDir,
    ...overrides,
  });
}

interface AppState {
  // Dokument
  pdfDoc: PdfDoc | null;
  fileName: string | null;
  numPages: number;
  currentPage: number;
  pageImage: HTMLCanvasElement | null;
  pageWidth: number;
  pageHeight: number;
  isLoading: boolean;
  error: string | null;

  // Målestokk
  scale: ScaleState;
  /** Resultat av automatisk PDF-tekstsøk (uavhengig av hva som er aktivt valgt) */
  autoDetected: ScaleState | null;
  isScanning: boolean;

  // Entiteter
  lines: LineEntity[];
  symbols: SymbolEntity[];
  /** Automatisk genererte overganger der dimensjon endres midt i en tegnet linje */
  transitions: TransitionEntity[];
  /** Automatisk genererte avgreiningsdeler (T-rør/45°-grenrør/påstikk/T-kanal) */
  branches: BranchEntity[];
  /** Automatisk genererte bend-markører der retningen endrer seg mellom to rette segmenter */
  bends: BendEntity[];
  /** Frittstående markup (tekst/sky) – påvirker ikke mengdelisten */
  annotations: AnnotationEntity[];
  /** Merkelapper (tags) med leaderlinje, festet til rør/kanaler – viser rørtype/dimensjon */
  tags: TagEntity[];
  /** Klammer (bæring) for rør/kanaler, med tilhørende gjengestag – auto-generert ved
   * tegning når «Klammer/gjengestag»-innstillingen er på, kan flyttes/slettes manuelt */
  clamps: ClampEntity[];
  /** Frittstående mål (punkt-til-punkt avstand / rom-areal) – påvirker ikke mengdelisten */
  measurements: MeasurementEntity[];

  // Verktøy / utvalg
  tool: ToolMode;
  selectedId: string | null;
  selectedKind: SelectedKind;
  /** Sist valgt materiale/dimensjon per underkategori, satt via verktøylinjens nedtrekksmeny */
  lineConfig: Record<string, { material: string; dimension: string }>;
  /** Sist brukte feltverdier (dimensjon, lengde, luftmengde osv.) per utstyrstype, satt via
   * utstyr-HUD-en før plassering – gjør at man slipper å skrive inn dimensjon på nytt for
   * hvert spjeld/ventil/lyddemper man plasserer av samme type. */
  symbolConfig: Record<string, Record<string, string | number>>;
  /** Id til symbolet musepekeren henger over, for hover-tooltip */
  hoveredSymbolId: string | null;
  /** Flervalg av linje-id-er (additivt til selectedId/selectedKind – shift-klikk/gummibånd) */
  multiSelection: Set<string>;
  /** Kategorikoder (f.eks. "31") som er skjult fra lerretet – kun en visningsfilter, påvirker ikke mengdelisten */
  hiddenCategories: Set<string>;

  /** Angre/gjenta-historikk over tegnedata (lines/symbols/transitions/branches) */
  history: { past: DrawSnapshot[]; future: DrawSnapshot[] };
  /** Sann under en pågående dra-gest, for å samle kontinuerlige oppdateringer til ett angre-steg */
  historyPaused: boolean;

  // Standardlengder for automatiske skjøter (konfigurerbart via innstillingsdialogen)
  standardLengths: { pipe: number; duct: number };
  settingsDialogOpen: boolean;
  /** Skjuler verktøylinje/lerret og lar mengdelisten fylle hele arbeidsflaten */
  focusMode: boolean;
  /** Visningsstil for tegnede rør/kanaler: 3D-sylinder eller enkel strek (med symboler) */
  pipeRenderStyle: PipeRenderStyle;
  /** Fargetema for tegneverktøyet (lys er standard) */
  theme: Theme;
  /** Vis luftrettings-piler på tilluft-/avtrekksventiler */
  showAirflowArrows: boolean;
  /** Skjul tekst-etiketter for komponenter (overganger/avgreininger) på lerretet */
  hideComponentLabels: boolean;
  /** Modus for arealmåling: fri polygon eller rektangel (klikk-og-dra) */
  areaMeasureMode: 'free' | 'rect';
  /** Egendefinerte systemkoder (f.eks. «360.001») som kan velges på rør/kanaler/utstyr */
  customSystems: string[];
  /** Egendefinerte dimensjoner lagt til per underkategori (runde eller rektangulære kanalmål osv.) */
  customDimensions: Record<string, string[]>;
  /** Egendefinerte farger per underkategori (subId → hex), overstyrer standardfargen i katalogen. */
  customColors: Record<string, string>;
  /** Sett inn klammer/gjengestag automatisk på nye kanaler/rør som tegnes. */
  autoInsertClamps: boolean;
  /** Avstand (mm) mellom klammer, per bygningsdel-type. */
  clampSpacing: { pipe: number; duct: number };
  /** Standard gjengestag-diameter (mm) for nye klammer. */
  clampRodDiameter: number;
  /** Standard gjengestag-lengde (mm) for nye klammer. */
  clampRodLengthMm: number;
  /** Gruppering/sortering av mengdelista – gjelder også Excel/PDF-eksport. */
  quantityGroupBy: GroupBy;
  quantitySortBy: SortBy;
  quantitySortDir: SortDir;
  /** Sist brukt stil for nye annotasjoner/markup, per type. Én felles form (ikke alle
   * felt er relevante for alle typer – f.eks. leser tekst-typene kun fontSize, mens
   * former leser strokeWidth) holder typingen enkel og gjenbrukbar. */
  annotationConfig: Record<AnnotationType, { color: string; strokeWidth: number; fontSize: number; opacity: number }>;

  // Ventende valg av avgreiningstype for kanaler (påstikk/T-kanal)
  pendingBranchChoice: PendingBranchChoice | null;
  /** Utstyr som er klikket inn et sted uten kanal/rør under – venter på bekreftelse */
  pendingOffLineSymbol: { type: SymbolType; x: number; y: number; systemId?: string } | null;
  /** Om bekreftelsesdialogen for utstyr-uten-kanal er slått av av brukeren */
  suppressOffLineWarning: boolean;

  // Visning (Konva stage-transform)
  view: ViewTransform;
  /** Synlig lerret-størrelse i piksler (satt av PdfCanvas' ResizeObserver), brukt til
   * å sentrere zoom-knappene på midten av det synlige området i stedet for origo. */
  stageSize: { width: number; height: number };

  // Dialog / kalibrering
  scaleDialogOpen: boolean;
  scaleDialogTab: 'auto' | 'manual' | 'calibrate';
  calibrationDistancePx: number | null;

  // Tilpass-til-skjerm-signal (økes for å be canvas refitte)
  fitSignal: number;

  /** Fanget PNG (data-URL) av hele tegningen, satt rett før «Skriv ut / PDF» kalles –
   * PrintableReport viser den øverst i utskriften. Nullstilles etterpå (ikke persistert,
   * kun et forbigående utskrifts-øyeblikksbilde). */
  printImage: string | null;

  // Actions
  beginLoad: () => void;
  loadDocument: (
    doc: PdfDoc,
    fileName: string,
    numPages: number,
    detected: ScaleState | null,
  ) => void;
  setError: (msg: string) => void;
  setPageImage: (canvas: HTMLCanvasElement, w: number, h: number) => void;
  setPage: (n: number) => void;
  rescanAutoScale: () => Promise<void>;
  /** Setter et gjenopprettet PDF-dokument uten å nullstille mengdedata (brukes ved gjenåpning av tilbud). */
  attachPdfDoc: (doc: PdfDoc, numPages: number) => void;

  setScale: (s: ScaleState) => void;
  openScaleDialog: (tab: 'auto' | 'manual' | 'calibrate') => void;
  closeScaleDialog: () => void;
  setCalibrationDistance: (px: number) => void;

  setTool: (t: ToolMode) => void;
  select: (id: string, kind: Exclude<SelectedKind, null>) => void;
  clearSelection: () => void;

  /** Velger materiale + dimensjon for en underkategori og aktiverer linjeverktøyet */
  setLineSelection: (subId: string, material: string, dimension: string) => void;
  /** Oppdaterer kun dimensjonen for en underkategoris aktive verktøykonfigurasjon (brukes ved bytte midt i tegning) */
  updateLineConfigDimension: (subId: string, dimension: string) => void;

  addLine: (
    subId: string,
    points: number[],
    material?: string,
    dimension?: string,
    systemId?: string,
  ) => void;
  /** Tegner en ferdig (evt. fleir-punkts) polylinje som separate rette 2-punkts
   * rør-/kanalsegmenter (ett per strekk), à la Revit – hvert rett strekk er sin egen
   * enhet som kan velges/måles for seg, mens bend mellom dem lagres som egne
   * BendEntity-markører (brukt i mengdelisten og for visning). `anchor` er det
   * forrige punktet på et rør/kanal man fortsetter fra (extend/continue) – brukes
   * kun til å beregne en ev. bend akkurat i skjøtepunktet, uten å duplisere det
   * gamle segmentet. */
  addLineRun: (
    subId: string,
    points: number[],
    material?: string,
    dimension?: string,
    systemId?: string,
    anchor?: { x: number; y: number },
  ) => void;
  /** Deler en linje i to ved (x,y) – brukt både av midtpunkt-håndtaket (legge til et
   * knekkpunkt) og «Del»-verktøyet (klikk hvor som helst på et rør/kanal for å dele
   * det, typisk for å endre dimensjon fra delepunktet – se `updateLineProps`, som
   * automatisk setter inn en overgang der dimensjonen deretter endres). `selectHalf`
   * velger hvilken halvdel (om noen) som skal markeres etterpå. */
  splitLineAt: (id: string, x: number, y: number, selectHalf?: 'a' | 'b' | 'none') => void;
  updateLinePoints: (id: string, points: number[]) => void;
  updateLineProps: (
    id: string,
    patch: Partial<Pick<LineEntity, 'subId' | 'material' | 'dimension' | 'systemId'>>,
  ) => void;

  addSymbol: (
    type: SymbolType,
    x: number,
    y: number,
    rotation?: number,
    mountedLineId?: string,
    systemId?: string,
  ) => void;
  /** Oppdaterer sist brukte feltverdier for en utstyrstype (dimensjon, lengde osv.),
   * brukt som forhåndsutfylt verdi for nye plasseringer av samme type. */
  setSymbolConfig: (type: SymbolType, patch: Record<string, string | number>) => void;
  updateSymbol: (
    id: string,
    patch: Partial<Pick<SymbolEntity, 'x' | 'y' | 'rotation' | 'systemId'>> & {
      props?: Partial<Record<string, string | number>>;
    },
  ) => void;
  setHoveredSymbol: (id: string | null) => void;
  /** Plasserer utstyr, men ber om bekreftelse først hvis det ikke er montert på et rør/kanal
   * (med mindre brukeren har slått av advarselen). */
  placeSymbolWithGuard: (
    type: SymbolType,
    x: number,
    y: number,
    rotation?: number,
    mountedLineId?: string,
    systemId?: string,
  ) => void;
  confirmPendingOffLineSymbol: (suppressFuture: boolean) => void;
  cancelPendingOffLineSymbol: () => void;
  setShowAirflowArrows: (show: boolean) => void;
  setHideComponentLabels: (hide: boolean) => void;
  setAreaMeasureMode: (mode: 'free' | 'rect') => void;
  addCustomSystem: (code: string) => void;
  removeCustomSystem: (code: string) => void;
  addCustomDimension: (subId: string, dimension: string) => void;
  removeCustomDimension: (subId: string, dimension: string) => void;
  setCustomColor: (subId: string, color: string) => void;
  resetCustomColor: (subId: string) => void;

  addAnnotation: (
    type: AnnotationType,
    x: number,
    y: number,
    extra?: Partial<
      Pick<AnnotationEntity, 'text' | 'width' | 'height' | 'rotation' | 'points' | 'fill' | 'opacity'>
    >,
  ) => void;
  updateAnnotation: (id: string, patch: Partial<AnnotationEntity>) => void;
  setAnnotationConfig: (
    type: AnnotationType,
    patch: Partial<{ color: string; fontSize: number; strokeWidth: number; opacity: number }>,
  ) => void;

  addTransition: (
    subId: string,
    material: string,
    fromDimension: string,
    toDimension: string,
    x: number,
    y: number,
  ) => void;

  addBranch: (
    subId: string,
    material: string,
    dimension: string,
    branchDimension: string,
    fittingType: BranchFittingType,
    x: number,
    y: number,
    angleDeg: number,
  ) => void;
  /** Endrer en eksisterende avgreining – i praksis kun fittingType (påstikk↔T-kanal
   * for kanal, T-rør↔45°-grenrør for rør), satt via dobbeltklikk på markøren. */
  updateBranch: (
    id: string,
    patch: Partial<Pick<BranchEntity, 'fittingType' | 'dimension' | 'branchDimension' | 'angleDeg'>>,
  ) => void;
  setPendingBranchChoice: (choice: PendingBranchChoice | null) => void;
  resolvePendingBranchChoice: (fittingType: BranchFittingType) => void;
  addTag: (lineId: string, x: number, y: number) => void;
  updateTagLabel: (id: string, labelX: number, labelY: number) => void;
  /** Flytter valgt tag-etikett med (dx,dy) via piltastene. */
  nudgeTag: (id: string, dx: number, dy: number, recordAsNewStep: boolean) => void;
  addClamp: (lineId: string, x: number, y: number, angleDeg: number, dimension: string) => void;
  updateClampPosition: (id: string, x: number, y: number) => void;
  /** Flytter valgt klammer med (dx,dy) via piltastene. */
  nudgeClamp: (id: string, dx: number, dy: number, recordAsNewStep: boolean) => void;
  addMeasurement: (type: MeasurementType, points: number[]) => void;
  /** Flytter valgt(e) linje(r) med (dx,dy) – flytter automatisk med hele den
   * sammenhengende rør-/kanalstrekningen (delte endepunkter), samt tilhørende
   * bend-/overgangs-/avgreiningsmarkører, tagger og montert utstyr, slik at
   * alt fortsatt henger sammen visuelt etter flyttingen. */
  nudgeSelected: (dx: number, dy: number, recordAsNewStep: boolean) => void;
  /** Flytter KUN én linje med (dx,dy). Tilkoblede naboer strekkes (kun det delte
   * endepunktet følger med, den andre enden står stille), og skjøt-markører,
   * monterte symboler og tagger på den flyttede linjen følger med – slik at kun
   * den valgte kanalen flyttes mens resten fortsatt henger sammen. */
  moveSingleLine: (lineId: string, dx: number, dy: number, recordAsNewStep: boolean) => void;
  /** Flytter HELE gjeldende utvalg (linjer, utstyr, markup, mål – ikke bare linjer) med
   * (dx,dy), med samme koblingsbevaring som Flytt-verktøyet og piltastene bruker.
   * Dispatcher internt til enten den vinkelbevarende én-linje-semantikken eller den
   * rigide fler-entitets-semantikken, avhengig av hva som er valgt (se planMove). */
  moveSelection: (dx: number, dy: number, recordAsNewStep?: boolean) => void;

  setStandardLength: (kind: 'pipe' | 'duct', mm: number) => void;
  setAutoInsertClamps: (on: boolean) => void;
  setClampSpacing: (kind: 'pipe' | 'duct', mm: number) => void;
  setClampRodDiameter: (mm: number) => void;
  setClampRodLengthMm: (mm: number) => void;
  updateClampProps: (id: string, patch: Partial<Pick<ClampEntity, 'rodDiameter' | 'rodLengthMm'>>) => void;
  setQuantityGroupBy: (v: GroupBy) => void;
  setQuantitySortBy: (v: SortBy) => void;
  setQuantitySortDir: (v: SortDir) => void;
  setPipeRenderStyle: (style: PipeRenderStyle) => void;
  setTheme: (theme: Theme) => void;
  openSettingsDialog: () => void;
  closeSettingsDialog: () => void;
  toggleFocusMode: () => void;

  deleteSelected: () => void;
  clearAll: () => void;

  // Angre/gjenta
  beginHistoryBatch: () => void;
  endHistoryBatch: () => void;
  undo: () => void;
  redo: () => void;

  // Lag/synlighet
  toggleCategoryVisibility: (code: string) => void;

  // Flervalg + bulk-redigering
  setMultiSelection: (ids: string[]) => void;
  toggleMultiSelect: (id: string) => void;
  clearMultiSelection: () => void;
  deleteMany: (ids: string[]) => void;
  updateManyLineProps: (
    ids: string[],
    patch: Partial<Pick<LineEntity, 'subId' | 'material' | 'dimension' | 'systemId'>>,
  ) => void;
  /** Dupliserer hele gjeldende utvalg forskjøvet med (dx,dy) – brukes av
   * Kopier-verktøyet. Kryssreferanser (tag/klammer → lineId, utstyr →
   * mountedLineId) remappes til KOPIEN av linjen når linjen selv er med i
   * utvalget, ellers beholdes referansen til originalen. Ingen auto-utvidelse til
   * hele den sammenhengende strekningen – kopierer nøyaktig det som er markert,
   * siden kopiering direkte endrer mengdelisten. Utvalget blir kopiene etterpå. */
  duplicateSelection: (dx: number, dy: number) => void;

  setView: (v: ViewTransform) => void;
  setStageSize: (size: { width: number; height: number }) => void;
  zoomBy: (factor: number) => void;
  requestFit: () => void;
  setPrintImage: (dataUrl: string | null) => void;

  /** Henter alt som kan lagres som JSON for det aktive tilbudet (ikke PDF-bytes/canvas). */
  exportSnapshot: () => TilbudSnapshot;
  /** Gjenoppretter mengdedata for et tilbud (eller tømmer alt hvis null). */
  importSnapshot: (snapshot: TilbudSnapshot | null) => void;
  /** Nullstiller hele arbeidsflaten (brukes når man bytter til et annet tilbud). */
  resetWorkspace: () => void;
}

export interface TilbudSnapshot {
  lines: LineEntity[];
  symbols: SymbolEntity[];
  transitions: TransitionEntity[];
  branches: BranchEntity[];
  bends: BendEntity[];
  annotations: AnnotationEntity[];
  tags: TagEntity[];
  clamps: ClampEntity[];
  measurements: MeasurementEntity[];
  scale: ScaleState;
  lineConfig: Record<string, { material: string; dimension: string }>;
  symbolConfig: Record<string, Record<string, string | number>>;
  fileName: string | null;
  numPages: number;
  currentPage: number;
}

const initialScale: ScaleState = { metersPerPixel: null, label: 'Ikke satt', source: 'none' };
const initialSettings = loadSettings();

export const useStore = create<AppState>((set, get) => {
  /** Lagrer nåværende tegnedata på angre-stacken, med mindre vi er midt i en
   * dra-gest som bevisst samles til ett steg (se beginHistoryBatch/endHistoryBatch). */
  function recordHistory() {
    const s = get();
    if (s.historyPaused) return;
    const snapshot: DrawSnapshot = {
      lines: s.lines,
      symbols: s.symbols,
      transitions: s.transitions,
      branches: s.branches,
      bends: s.bends,
      annotations: s.annotations,
      tags: s.tags,
      clamps: s.clamps,
      measurements: s.measurements,
    };
    set((st) => ({
      history: { past: [...st.history.past.slice(-(MAX_HISTORY - 1)), snapshot], future: [] },
    }));
  }

  return {
  pdfDoc: null,
  fileName: null,
  numPages: 0,
  currentPage: 1,
  pageImage: null,
  pageWidth: 0,
  pageHeight: 0,
  isLoading: false,
  error: null,

  scale: initialScale,
  autoDetected: null,
  isScanning: false,

  lines: [],
  symbols: [],
  transitions: [],
  branches: [],
  bends: [],
  annotations: [],
  tags: [],
  clamps: [],
  measurements: [],

  tool: 'select',
  selectedId: null,
  selectedKind: null,
  lineConfig: {},
  symbolConfig: {},
  hoveredSymbolId: null,
  multiSelection: new Set<string>(),
  hiddenCategories: new Set<string>(),

  history: { past: [], future: [] },
  historyPaused: false,

  standardLengths: { pipe: initialSettings.pipe, duct: initialSettings.duct },
  settingsDialogOpen: false,
  focusMode: false,
  pipeRenderStyle: initialSettings.pipeRenderStyle,
  theme: initialSettings.theme,
  showAirflowArrows: initialSettings.showAirflowArrows,
  hideComponentLabels: initialSettings.hideComponentLabels,
  areaMeasureMode: 'free',
  customSystems: initialSettings.customSystems,
  customDimensions: initialSettings.customDimensions,
  customColors: initialSettings.customColors,
  autoInsertClamps: initialSettings.autoInsertClamps,
  clampSpacing: initialSettings.clampSpacing,
  clampRodDiameter: initialSettings.clampRodDiameter,
  clampRodLengthMm: initialSettings.clampRodLengthMm,
  quantityGroupBy: initialSettings.quantityGroupBy,
  quantitySortBy: initialSettings.quantitySortBy,
  quantitySortDir: initialSettings.quantitySortDir,
  annotationConfig: {
    text: { color: '#1a1a1a', strokeWidth: 2, fontSize: 14, opacity: 1 },
    textbox: { color: '#1a1a1a', strokeWidth: 2, fontSize: 14, opacity: 1 },
    callout: { color: '#1a1a1a', strokeWidth: 2, fontSize: 13, opacity: 1 },
    cloud: { color: '#e74c3c', strokeWidth: 2, fontSize: 14, opacity: 1 },
    line: { color: '#e74c3c', strokeWidth: 2, fontSize: 14, opacity: 1 },
    arrow: { color: '#e74c3c', strokeWidth: 2, fontSize: 14, opacity: 1 },
    ellipse: { color: '#e74c3c', strokeWidth: 2, fontSize: 14, opacity: 1 },
    rect: { color: '#e74c3c', strokeWidth: 2, fontSize: 14, opacity: 1 },
    polygon: { color: '#e74c3c', strokeWidth: 2, fontSize: 14, opacity: 1 },
    highlight: { color: '#ffff00', strokeWidth: 0, fontSize: 14, opacity: 0.35 },
  },

  pendingBranchChoice: null,
  pendingOffLineSymbol: null,
  suppressOffLineWarning: initialSettings.suppressOffLineWarning,

  view: { scale: 1, x: 0, y: 0 },
  stageSize: { width: 800, height: 600 },

  scaleDialogOpen: false,
  scaleDialogTab: 'manual',
  calibrationDistancePx: null,

  fitSignal: 0,
  printImage: null,

  beginLoad: () => set({ isLoading: true, error: null }),

  attachPdfDoc: (doc, numPages) =>
    set((s) => ({
      pdfDoc: doc,
      numPages,
      isLoading: false,
      error: null,
      currentPage: Math.min(Math.max(1, s.currentPage), numPages || 1),
    })),

  loadDocument: (doc, fileName, numPages, detected) =>
    set({
      pdfDoc: doc,
      fileName,
      numPages,
      currentPage: 1,
      isLoading: false,
      error: null,
      lines: [],
      symbols: [],
      transitions: [],
      branches: [],
      bends: [],
      selectedId: null,
      selectedKind: null,
      multiSelection: new Set<string>(),
      history: { past: [], future: [] },
      scale: detected ?? initialScale,
      autoDetected: detected,
    }),

  setError: (msg) => set({ isLoading: false, error: msg }),

  setPageImage: (canvas, w, h) => set({ pageImage: canvas, pageWidth: w, pageHeight: h }),

  rescanAutoScale: async () => {
    const { pdfDoc } = get();
    if (!pdfDoc) return;
    set({ isScanning: true });
    try {
      const detected = await detectScaleFromPdf(pdfDoc);
      set({ autoDetected: detected, isScanning: false });
    } catch {
      set({ isScanning: false });
    }
  },

  setPage: (n) => {
    const { numPages } = get();
    const page = Math.min(Math.max(1, n), numPages || 1);
    set({ currentPage: page, selectedId: null, selectedKind: null, multiSelection: new Set<string>() });
  },

  setScale: (s) => set({ scale: s }),
  openScaleDialog: (tab) => set({ scaleDialogOpen: true, scaleDialogTab: tab }),
  closeScaleDialog: () =>
    set({ scaleDialogOpen: false, calibrationDistancePx: null, tool: 'select' }),
  setCalibrationDistance: (px) =>
    set({ calibrationDistancePx: px, scaleDialogOpen: true, scaleDialogTab: 'calibrate' }),

  setTool: (t) => {
    // Flytt/Kopier/Del jobber PÅ det gjeldende utvalget – å nullstille det her ville
    // gjort verktøyene ubrukelige. Alle andre verktøy nullstiller utvalget som før.
    if (t === 'move' || t === 'copy' || t === 'split') {
      set({ tool: t });
      return;
    }
    set({ tool: t, selectedId: null, selectedKind: null });
  },
  select: (id, kind) => set({ selectedId: id, selectedKind: kind }),
  clearSelection: () => set({ selectedId: null, selectedKind: null }),

  setLineSelection: (subId, material, dimension) =>
    set((s) => ({
      lineConfig: { ...s.lineConfig, [subId]: { material, dimension } },
      tool: `line:${subId}`,
      selectedId: null,
      selectedKind: null,
    })),

  updateLineConfigDimension: (subId, dimension) =>
    set((s) => {
      const sub = SUBCATEGORIES[subId];
      const material = s.lineConfig[subId]?.material ?? sub.materials[0];
      return { lineConfig: { ...s.lineConfig, [subId]: { material, dimension } } };
    }),

  addLine: (subId, points, material, dimension, systemId) => {
    recordHistory();
    const sub = SUBCATEGORIES[subId];
    const cfg = get().lineConfig[subId];
    const line: LineEntity = {
      id: nextId('line'),
      page: get().currentPage,
      subId,
      material: material ?? cfg?.material ?? sub.materials[0],
      dimension: dimension ?? cfg?.dimension ?? sub.dimensions[0],
      points,
      systemId,
    };
    set((s) => ({ lines: [...s.lines, line], selectedId: line.id, selectedKind: 'line' }));
  },

  addLineRun: (subId, points, material, dimension, systemId, anchor) => {
    if (points.length < 4) return;
    recordHistory();
    const sub = SUBCATEGORIES[subId];
    const cfg = get().lineConfig[subId];
    const finalMaterial = material ?? cfg?.material ?? sub.materials[0];
    const finalDimension = dimension ?? cfg?.dimension ?? sub.dimensions[0];
    const page = get().currentPage;

    const newLines: LineEntity[] = [];
    for (let i = 0; i + 3 < points.length; i += 2) {
      newLines.push({
        id: nextId('line'),
        page,
        subId,
        material: finalMaterial,
        dimension: finalDimension,
        points: [points[i], points[i + 1], points[i + 2], points[i + 3]],
        systemId,
      });
    }
    // `anchor` (forrige punkt på røret man fortsetter fra) tas kun med i selve
    // bend-beregningen – ikke i newLines over – slik at skjøtepunktet også kan få
    // en bend-markør uten at det gamle segmentet dupliseres som en ny linje.
    const bendSourcePoints = anchor ? [anchor.x, anchor.y, ...points] : points;
    const newBends: BendEntity[] = polylineBendAngles(bendSourcePoints).map((b) => ({
      id: nextId('bend'),
      page,
      subId,
      material: finalMaterial,
      dimension: finalDimension,
      x: b.x,
      y: b.y,
      angleDeg: classifyBendAngle(b.angleDeg),
    }));
    // Auto-klammer/gjengestag: sett inn klammer-markører jevnt fordelt langs hvert nye
    // segment (kun nye linjer – berører ikke allerede tegnede rør/kanaler), når
    // innstillingen er slått på og målestokk er satt (avstanden er oppgitt i mm).
    const clampState = get();
    const kind = categoryOf(subId)?.kind;
    const newClamps: ClampEntity[] = [];
    if (clampState.autoInsertClamps && kind && clampState.scale.metersPerPixel) {
      const spacingPx = mmToPx(clampState.clampSpacing[kind], clampState.scale.metersPerPixel);
      if (spacingPx > 0) {
        for (const line of newLines) {
          const [x0, y0, x1, y1] = line.points;
          const segDx = x1 - x0;
          const segDy = y1 - y0;
          const lengthPx = Math.hypot(segDx, segDy);
          const angleDeg = (Math.atan2(segDy, segDx) * 180) / Math.PI;
          const count = Math.floor(lengthPx / spacingPx);
          for (let k = 1; k <= count; k++) {
            const t = (k * spacingPx) / lengthPx;
            newClamps.push({
              id: nextId('clamp'),
              page,
              lineId: line.id,
              x: x0 + segDx * t,
              y: y0 + segDy * t,
              angleDeg,
              dimension: finalDimension,
              rodDiameter: clampState.clampRodDiameter,
              rodLengthMm: clampState.clampRodLengthMm,
            });
          }
        }
      }
    }

    const lastLine = newLines[newLines.length - 1];
    set((s) => ({
      lines: [...s.lines, ...newLines],
      bends: [...s.bends, ...newBends],
      clamps: [...s.clamps, ...newClamps],
      selectedId: lastLine?.id ?? null,
      selectedKind: lastLine ? 'line' : null,
    }));
  },

  splitLineAt: (id, x, y, selectHalf = 'none') => {
    const line = get().lines.find((l) => l.id === id);
    if (!line) return;
    // Bruk closestPointOnPolyline i stedet for å anta et rett 2-punkts segment: da
    // fungerer delingen også på eldre fler-punkts linjer (den gamle koden kastet
    // stille alle punkter etter de fire første).
    const cp = closestPointOnPolyline(line.points, { x, y });
    if (!cp) return;
    const n = line.points.length;
    const eps = 0.5;
    const atVertex = (i: number) => Math.abs(x - line.points[i]) < eps && Math.abs(y - line.points[i + 1]) < eps;
    if (atVertex(0) || atVertex(n - 2)) return; // ville gitt en null-lang halvdel
    recordHistory();

    const cut = cp.segIndex * 2;
    const aPoints = [...line.points.slice(0, cut + 2), x, y];
    const bPoints = [x, y, ...line.points.slice(cut + 2)];
    const a: LineEntity = { ...line, id: nextId('line'), points: aPoints };
    const b: LineEntity = { ...line, id: nextId('line'), points: bPoints };

    // Hvilken halvdel ligger nærmest en markør? Uten dette ble tagger/klammer/montert
    // utstyr liggende igjen med en lineId som ikke lenger finnes (den gamle koden delte
    // aldri opp referansene) – klammeret havnet da i mengdelisten uten gyldig
    // underkategori/materiale, og taggen forsvant fra lerretet.
    const halfFor = (px: number, py: number): string =>
      (closestPointOnPolyline(aPoints, { x: px, y: py })?.distance ?? Infinity) <=
      (closestPointOnPolyline(bPoints, { x: px, y: py })?.distance ?? Infinity)
        ? a.id
        : b.id;

    set((s) => ({
      lines: [...s.lines.filter((l) => l.id !== id), a, b],
      tags: s.tags.map((t) => (t.lineId === id ? { ...t, lineId: halfFor(t.x, t.y) } : t)),
      clamps: s.clamps.map((c) => (c.lineId === id ? { ...c, lineId: halfFor(c.x, c.y) } : c)),
      symbols: s.symbols.map((sy) =>
        sy.mountedLineId === id ? { ...sy, mountedLineId: halfFor(sy.x, sy.y) } : sy,
      ),
      selectedId: selectHalf === 'a' ? a.id : selectHalf === 'b' ? b.id : null,
      selectedKind: selectHalf === 'none' ? null : 'line',
      // Den gamle id-en kan ligge i flervalget – ville ellers blitt en død id der.
      multiSelection: new Set<string>(),
    }));
  },

  updateLinePoints: (id, points) => {
    recordHistory();
    set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, points } : l)) }));
  },

  updateLineProps: (id, patch) => {
    recordHistory();
    set((s) => {
      const lines = s.lines.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        // bytter man underkategori, sørg for gyldig materiale/dimensjon
        if (patch.subId) {
          const sub = SUBCATEGORIES[patch.subId];
          if (!sub.materials.includes(next.material)) next.material = sub.materials[0];
          if (!sub.dimensions.includes(next.dimension)) next.dimension = sub.dimensions[0];
        }
        return next;
      });
      // Endret dimensjon/underkategori kan gjøre at en skjøt til en nabo nå har (eller
      // ikke lenger har) ulik dimensjon – typisk rett etter at «Del»-verktøyet har delt
      // en kanal og man endrer dimensjon på den ene halvdelen. Sett inn/fjern overgangen
      // i skjøten deretter (se syncTransitionsAtJoints).
      if (patch.dimension === undefined && patch.subId === undefined) return { lines };
      return { lines, transitions: syncTransitionsAtJoints(lines, s.transitions, s.currentPage, new Set([id])) };
    });
  },

  addSymbol: (type, x, y, rotation = 0, mountedLineId, systemId) => {
    recordHistory();
    const sym: SymbolEntity = {
      id: nextId('sym'),
      page: get().currentPage,
      type,
      x,
      y,
      rotation,
      props: { ...defaultSymbolProps(type), ...get().symbolConfig[type] },
      mountedLineId,
      systemId,
    };
    set((s) => ({ symbols: [...s.symbols, sym], selectedId: sym.id, selectedKind: 'symbol' }));
  },

  setSymbolConfig: (type, patch) =>
    set((s) => ({
      symbolConfig: { ...s.symbolConfig, [type]: { ...s.symbolConfig[type], ...patch } },
    })),

  placeSymbolWithGuard: (type, x, y, rotation = 0, mountedLineId, systemId) => {
    if (mountedLineId || get().suppressOffLineWarning) {
      get().addSymbol(type, x, y, rotation, mountedLineId, systemId);
      return;
    }
    set({ pendingOffLineSymbol: { type, x, y, systemId } });
  },

  confirmPendingOffLineSymbol: (suppressFuture) => {
    const pending = get().pendingOffLineSymbol;
    if (!pending) return;
    get().addSymbol(pending.type, pending.x, pending.y, 0, undefined, pending.systemId);
    set({ pendingOffLineSymbol: null });
    if (suppressFuture) {
      set((s) => {
        persistSettings(s, { suppressOffLineWarning: true });
        return { suppressOffLineWarning: true };
      });
    }
  },

  cancelPendingOffLineSymbol: () => set({ pendingOffLineSymbol: null }),

  setShowAirflowArrows: (show) =>
    set((s) => {
      persistSettings(s, { showAirflowArrows: show });
      return { showAirflowArrows: show };
    }),

  setHideComponentLabels: (hide) =>
    set((s) => {
      persistSettings(s, { hideComponentLabels: hide });
      return { hideComponentLabels: hide };
    }),

  setAreaMeasureMode: (mode) => set({ areaMeasureMode: mode }),

  addCustomSystem: (code) =>
    set((s) => {
      const trimmed = code.trim();
      if (!trimmed || s.customSystems.includes(trimmed)) return s;
      const next = [...s.customSystems, trimmed];
      persistSettings(s, { customSystems: next });
      return { customSystems: next };
    }),

  removeCustomSystem: (code) =>
    set((s) => {
      const next = s.customSystems.filter((c) => c !== code);
      persistSettings(s, { customSystems: next });
      return { customSystems: next };
    }),

  addCustomDimension: (subId, dimension) =>
    set((s) => {
      const trimmed = dimension.trim();
      const existing = s.customDimensions[subId] ?? [];
      if (!trimmed || existing.includes(trimmed) || SUBCATEGORIES[subId]?.dimensions.includes(trimmed)) return s;
      const next = { ...s.customDimensions, [subId]: [...existing, trimmed] };
      persistSettings(s, { customDimensions: next });
      return { customDimensions: next };
    }),

  removeCustomDimension: (subId, dimension) =>
    set((s) => {
      const existing = s.customDimensions[subId] ?? [];
      const next = { ...s.customDimensions, [subId]: existing.filter((d) => d !== dimension) };
      persistSettings(s, { customDimensions: next });
      return { customDimensions: next };
    }),

  setCustomColor: (subId, color) =>
    set((s) => {
      const next = { ...s.customColors, [subId]: color };
      persistSettings(s, { customColors: next });
      return { customColors: next };
    }),

  resetCustomColor: (subId) =>
    set((s) => {
      const next = { ...s.customColors };
      delete next[subId];
      persistSettings(s, { customColors: next });
      return { customColors: next };
    }),

  addAnnotation: (type, x, y, extra) => {
    recordHistory();
    const cfg = get().annotationConfig[type];
    let note: AnnotationEntity = {
      id: nextId('note'),
      page: get().currentPage,
      type,
      x,
      y,
      rotation: 0,
      color: cfg.color,
    };
    if (type === 'text') {
      note = { ...note, text: extra?.text ?? 'Tekst', fontSize: cfg.fontSize };
    } else if (type === 'textbox') {
      note = {
        ...note,
        text: extra?.text ?? 'Tekst',
        fontSize: cfg.fontSize,
        width: extra?.width ?? 160,
        height: extra?.height ?? 60,
      };
    } else if (type === 'callout') {
      // Klikkpunktet er lederens mål-anker; selve meldingsboksen plasseres med en
      // standard-forskyvning (samme mønster som TagEntity), og kan dras videre av bruker.
      note = {
        ...note,
        x: x + 40,
        y: y - 40,
        anchorX: x,
        anchorY: y,
        text: extra?.text ?? 'Melding',
        fontSize: cfg.fontSize,
        width: extra?.width ?? 160,
        height: extra?.height ?? 60,
      };
    } else if (type === 'cloud' || type === 'rect' || type === 'ellipse') {
      note = {
        ...note,
        width: extra?.width ?? 160,
        height: extra?.height ?? 100,
        strokeWidth: cfg.strokeWidth,
        fill: extra?.fill,
      };
    } else if (type === 'highlight') {
      note = {
        ...note,
        width: extra?.width ?? 160,
        height: extra?.height ?? 60,
        opacity: cfg.opacity,
      };
    } else if (type === 'line' || type === 'arrow' || type === 'polygon') {
      // Punkt-baserte former lagrer geometrien i `points` (absolutte bildekoordinater,
      // samme mønster som MeasurementEntity) – x/y på selve entiteten er derfor 0.
      note = {
        ...note,
        x: 0,
        y: 0,
        points: extra?.points ?? (type === 'polygon' ? [] : [x, y, x, y]),
        strokeWidth: cfg.strokeWidth,
        fill: extra?.fill,
      };
    }
    note = { ...note, ...extra };
    set((s) => ({ annotations: [...s.annotations, note], selectedId: note.id, selectedKind: 'annotation' }));
  },

  updateAnnotation: (id, patch) => {
    recordHistory();
    set((s) => ({ annotations: s.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  },

  setAnnotationConfig: (type, patch) =>
    set((s) => ({
      annotationConfig: { ...s.annotationConfig, [type]: { ...s.annotationConfig[type], ...patch } },
    })),

  updateSymbol: (id, patch) => {
    recordHistory();
    set((s) => ({
      symbols: s.symbols.map((sy) => {
        if (sy.id !== id) return sy;
        const { props, ...rest } = patch;
        const nextProps = props ? { ...sy.props, ...props } : sy.props;
        return { ...sy, ...rest, props: nextProps as Record<string, string | number> };
      }),
    }));
  },

  setHoveredSymbol: (id) => set({ hoveredSymbolId: id }),

  addTransition: (subId, material, fromDimension, toDimension, x, y) => {
    recordHistory();
    const transition: TransitionEntity = {
      id: nextId('trans'),
      page: get().currentPage,
      subId,
      material,
      fromDimension,
      toDimension,
      x,
      y,
    };
    set((s) => ({ transitions: [...s.transitions, transition] }));
  },

  addBranch: (subId, material, dimension, branchDimension, fittingType, x, y, angleDeg) => {
    recordHistory();
    const branch: BranchEntity = {
      id: nextId('branch'),
      page: get().currentPage,
      subId,
      material,
      dimension,
      branchDimension,
      fittingType,
      x,
      y,
      angleDeg,
    };
    set((s) => ({ branches: [...s.branches, branch] }));
  },

  updateBranch: (id, patch) => {
    recordHistory();
    set((s) => ({ branches: s.branches.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  },

  addTag: (lineId, x, y) => {
    recordHistory();
    const tag: TagEntity = {
      id: nextId('tag'),
      page: get().currentPage,
      lineId,
      x,
      y,
      // Standard-forskyvning for tag-boksen, slik at den ikke havner rett oppå
      // leaderlinjens ankerpunkt – brukeren kan dra den videre selv.
      labelX: x + 40,
      labelY: y - 40,
    };
    set((s) => ({ tags: [...s.tags, tag], selectedId: tag.id, selectedKind: 'tag' }));
  },

  updateTagLabel: (id, labelX, labelY) => {
    recordHistory();
    set((s) => ({ tags: s.tags.map((t) => (t.id === id ? { ...t, labelX, labelY } : t)) }));
  },

  nudgeTag: (id, dx, dy, recordAsNewStep) => {
    if (recordAsNewStep) recordHistory();
    set((s) => ({
      tags: s.tags.map((t) => (t.id === id ? { ...t, labelX: t.labelX + dx, labelY: t.labelY + dy } : t)),
    }));
  },

  addClamp: (lineId, x, y, angleDeg, dimension) => {
    recordHistory();
    const s0 = get();
    const clamp: ClampEntity = {
      id: nextId('clamp'),
      page: s0.currentPage,
      lineId,
      x,
      y,
      angleDeg,
      dimension,
      rodDiameter: s0.clampRodDiameter,
      rodLengthMm: s0.clampRodLengthMm,
    };
    set((s) => ({ clamps: [...s.clamps, clamp], selectedId: clamp.id, selectedKind: 'clamp' }));
  },

  updateClampPosition: (id, x, y) => {
    recordHistory();
    set((s) => ({ clamps: s.clamps.map((c) => (c.id === id ? { ...c, x, y } : c)) }));
  },

  nudgeClamp: (id, dx, dy, recordAsNewStep) => {
    if (recordAsNewStep) recordHistory();
    set((s) => ({
      clamps: s.clamps.map((c) => (c.id === id ? { ...c, x: c.x + dx, y: c.y + dy } : c)),
    }));
  },

  addMeasurement: (type, points) => {
    recordHistory();
    const measurement: MeasurementEntity = {
      id: nextId('measure'),
      page: get().currentPage,
      type,
      points,
    };
    set((s) => ({
      measurements: [...s.measurements, measurement],
      selectedId: measurement.id,
      selectedKind: 'measurement',
    }));
  },

  setPendingBranchChoice: (choice) => set({ pendingBranchChoice: choice }),

  resolvePendingBranchChoice: (fittingType) => {
    const choice = get().pendingBranchChoice;
    if (!choice) return;
    if (choice.editId) {
      // Dobbeltklikk på en EKSISTERENDE avgreining – bytt type i stedet for å
      // opprette en ny.
      get().updateBranch(choice.editId, { fittingType });
    } else {
      get().addBranch(
        choice.mainSubId,
        choice.mainMaterial,
        choice.mainDimension,
        choice.branchDimension,
        fittingType,
        choice.x,
        choice.y,
        choice.angleDeg,
      );
    }
    set({ pendingBranchChoice: null });
  },

  setStandardLength: (kind, mm) =>
    set((s) => {
      const next = { ...s.standardLengths, [kind]: mm };
      persistSettings(s, { pipe: next.pipe, duct: next.duct });
      return { standardLengths: next };
    }),

  setAutoInsertClamps: (on) =>
    set((s) => {
      persistSettings(s, { autoInsertClamps: on });
      return { autoInsertClamps: on };
    }),

  setClampSpacing: (kind, mm) =>
    set((s) => {
      const next = { ...s.clampSpacing, [kind]: mm };
      persistSettings(s, { clampSpacing: next });
      return { clampSpacing: next };
    }),

  setClampRodDiameter: (mm) =>
    set((s) => {
      persistSettings(s, { clampRodDiameter: mm });
      return { clampRodDiameter: mm };
    }),

  setClampRodLengthMm: (mm) =>
    set((s) => {
      persistSettings(s, { clampRodLengthMm: mm });
      return { clampRodLengthMm: mm };
    }),

  updateClampProps: (id, patch) => {
    recordHistory();
    set((s) => ({ clamps: s.clamps.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  },

  setQuantityGroupBy: (v) =>
    set((s) => {
      persistSettings(s, { quantityGroupBy: v });
      return { quantityGroupBy: v };
    }),
  setQuantitySortBy: (v) =>
    set((s) => {
      persistSettings(s, { quantitySortBy: v });
      return { quantitySortBy: v };
    }),
  setQuantitySortDir: (v) =>
    set((s) => {
      persistSettings(s, { quantitySortDir: v });
      return { quantitySortDir: v };
    }),

  setPipeRenderStyle: (style) =>
    set((s) => {
      persistSettings(s, { pipeRenderStyle: style });
      return { pipeRenderStyle: style };
    }),

  setTheme: (theme) =>
    set((s) => {
      persistSettings(s, { theme });
      return { theme };
    }),
  openSettingsDialog: () => set({ settingsDialogOpen: true }),
  closeSettingsDialog: () => set({ settingsDialogOpen: false }),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),

  deleteSelected: () => {
    const { selectedId, selectedKind } = get();
    if (!selectedId) return;
    recordHistory();
    if (selectedKind === 'line') {
      set((s) => ({ lines: s.lines.filter((l) => l.id !== selectedId) }));
    } else if (selectedKind === 'symbol') {
      set((s) => ({ symbols: s.symbols.filter((sy) => sy.id !== selectedId) }));
    } else if (selectedKind === 'branch') {
      set((s) => ({ branches: s.branches.filter((b) => b.id !== selectedId) }));
    } else if (selectedKind === 'transition') {
      set((s) => ({ transitions: s.transitions.filter((t) => t.id !== selectedId) }));
    } else if (selectedKind === 'bend') {
      set((s) => ({ bends: s.bends.filter((b) => b.id !== selectedId) }));
    } else if (selectedKind === 'annotation') {
      set((s) => ({ annotations: s.annotations.filter((a) => a.id !== selectedId) }));
    } else if (selectedKind === 'tag') {
      set((s) => ({ tags: s.tags.filter((t) => t.id !== selectedId) }));
    } else if (selectedKind === 'clamp') {
      set((s) => ({ clamps: s.clamps.filter((c) => c.id !== selectedId) }));
    } else if (selectedKind === 'measurement') {
      set((s) => ({ measurements: s.measurements.filter((m) => m.id !== selectedId) }));
    }
    set({ selectedId: null, selectedKind: null });
  },

  clearAll: () => {
    recordHistory();
    set({
      lines: [],
      symbols: [],
      transitions: [],
      branches: [],
      bends: [],
      annotations: [],
      tags: [],
      clamps: [],
      measurements: [],
      selectedId: null,
      selectedKind: null,
    });
  },

  beginHistoryBatch: () => {
    recordHistory();
    set({ historyPaused: true });
  },
  endHistoryBatch: () => set({ historyPaused: false }),

  undo: () => {
    const s = get();
    if (s.history.past.length === 0) return;
    const previous = s.history.past[s.history.past.length - 1];
    const current: DrawSnapshot = {
      lines: s.lines,
      symbols: s.symbols,
      transitions: s.transitions,
      branches: s.branches,
      bends: s.bends,
      annotations: s.annotations,
      tags: s.tags,
      clamps: s.clamps,
      measurements: s.measurements,
    };
    set({
      ...previous,
      history: { past: s.history.past.slice(0, -1), future: [current, ...s.history.future] },
      selectedId: null,
      selectedKind: null,
      multiSelection: new Set<string>(),
    });
  },

  redo: () => {
    const s = get();
    if (s.history.future.length === 0) return;
    const next = s.history.future[0];
    const current: DrawSnapshot = {
      lines: s.lines,
      symbols: s.symbols,
      transitions: s.transitions,
      branches: s.branches,
      bends: s.bends,
      annotations: s.annotations,
      tags: s.tags,
      clamps: s.clamps,
      measurements: s.measurements,
    };
    set({
      ...next,
      history: { past: [...s.history.past, current], future: s.history.future.slice(1) },
      selectedId: null,
      selectedKind: null,
      multiSelection: new Set<string>(),
    });
  },

  toggleCategoryVisibility: (code) =>
    set((s) => {
      const next = new Set(s.hiddenCategories);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return { hiddenCategories: next };
    }),

  setMultiSelection: (ids) => set({ multiSelection: new Set(ids) }),
  toggleMultiSelect: (id) =>
    set((s) => {
      const next = new Set(s.multiSelection);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { multiSelection: next };
    }),
  clearMultiSelection: () => set({ multiSelection: new Set<string>() }),

  deleteMany: (ids) => {
    if (ids.length === 0) return;
    recordHistory();
    const idSet = new Set(ids);
    set((s) => ({
      lines: s.lines.filter((l) => !idSet.has(l.id)),
      symbols: s.symbols.filter((sy) => !idSet.has(sy.id)),
      branches: s.branches.filter((b) => !idSet.has(b.id)),
      transitions: s.transitions.filter((t) => !idSet.has(t.id)),
      bends: s.bends.filter((b) => !idSet.has(b.id)),
      annotations: s.annotations.filter((a) => !idSet.has(a.id)),
      tags: s.tags.filter((t) => !idSet.has(t.id)),
      clamps: s.clamps.filter((c) => !idSet.has(c.id)),
      measurements: s.measurements.filter((m) => !idSet.has(m.id)),
      multiSelection: new Set<string>(),
    }));
  },

  duplicateSelection: (dx, dy) => {
    const s = get();
    const ids = new Set(s.multiSelection);
    if (s.selectedId) ids.add(s.selectedId);
    if (ids.size === 0) return;
    // Sidefilter: multiSelection tømmes ikke automatisk ved sidebytte i alle
    // tilfeller, så et gammelt utvalg fra en annen side skal ikke kopieres inn her.
    const onPage = <T extends { id: string; page: number }>(arr: T[]) =>
      arr.filter((e) => ids.has(e.id) && e.page === s.currentPage);

    const srcLines = onPage(s.lines);
    const srcSymbols = onPage(s.symbols);
    const srcBends = onPage(s.bends);
    const srcTransitions = onPage(s.transitions);
    const srcBranches = onPage(s.branches);
    const srcAnnotations = onPage(s.annotations);
    const srcTags = onPage(s.tags);
    const srcClamps = onPage(s.clamps);
    const srcMeasurements = onPage(s.measurements);
    const total =
      srcLines.length +
      srcSymbols.length +
      srcBends.length +
      srcTransitions.length +
      srcBranches.length +
      srcAnnotations.length +
      srcTags.length +
      srcClamps.length +
      srcMeasurements.length;
    if (total === 0) return;
    recordHistory();

    const shift = (pts: number[]) => pts.map((v, i) => (i % 2 === 0 ? v + dx : v + dy));

    // Linjene klones FØRST, slik at gammel→ny-id-kartet finnes når tagger/klammer/
    // montert utstyr klones og skal peke på sin egen kopi i stedet for originalen.
    const lineIdMap = new Map<string, string>();
    const newLines: LineEntity[] = srcLines.map((l) => {
      const copy = { ...l, id: nextId('line'), points: shift(l.points) };
      lineIdMap.set(l.id, copy.id);
      return copy;
    });
    // Ble ikke vertslinjen kopiert med (man kopierte f.eks. bare et klammer), beholder
    // kopien referansen til ORIGINALEN – den er fortsatt gyldig (ingen død id), og
    // «enda et klammer/en tag på samme kanal» er en helt legitim kopi.
    const remapLine = (lineId: string) => lineIdMap.get(lineId) ?? lineId;

    const newSymbols: SymbolEntity[] = srcSymbols.map((sy) => ({
      ...sy,
      id: nextId('sym'),
      x: sy.x + dx,
      y: sy.y + dy,
      props: { ...sy.props }, // egen props-bag – ikke delt med originalen
      mountedLineId: sy.mountedLineId ? remapLine(sy.mountedLineId) : sy.mountedLineId,
    }));
    const newBends: BendEntity[] = srcBends.map((b) => ({ ...b, id: nextId('bend'), x: b.x + dx, y: b.y + dy }));
    const newTransitions: TransitionEntity[] = srcTransitions.map((t) => ({
      ...t,
      id: nextId('trans'),
      x: t.x + dx,
      y: t.y + dy,
    }));
    const newBranches: BranchEntity[] = srcBranches.map((b) => ({
      ...b,
      id: nextId('branch'),
      x: b.x + dx,
      y: b.y + dy,
    }));
    const newTags: TagEntity[] = srcTags.map((t) => ({
      ...t,
      id: nextId('tag'),
      lineId: remapLine(t.lineId),
      x: t.x + dx,
      y: t.y + dy,
      labelX: t.labelX + dx,
      labelY: t.labelY + dy,
    }));
    const newClamps: ClampEntity[] = srcClamps.map((c) => ({
      ...c,
      id: nextId('clamp'),
      lineId: remapLine(c.lineId),
      x: c.x + dx,
      y: c.y + dy,
    }));
    const newAnnotations: AnnotationEntity[] = srcAnnotations.map((a) => ({
      ...a,
      id: nextId('note'),
      x: a.x + dx,
      y: a.y + dy,
      anchorX: a.anchorX != null ? a.anchorX + dx : undefined,
      anchorY: a.anchorY != null ? a.anchorY + dy : undefined,
      points: a.points ? shift(a.points) : undefined,
    }));
    const newMeasurements: MeasurementEntity[] = srcMeasurements.map((m) => ({
      ...m,
      id: nextId('measure'),
      points: shift(m.points),
    }));

    const created: { id: string; kind: Exclude<SelectedKind, null> }[] = [
      ...newLines.map((e) => ({ id: e.id, kind: 'line' as const })),
      ...newSymbols.map((e) => ({ id: e.id, kind: 'symbol' as const })),
      ...newBends.map((e) => ({ id: e.id, kind: 'bend' as const })),
      ...newTransitions.map((e) => ({ id: e.id, kind: 'transition' as const })),
      ...newBranches.map((e) => ({ id: e.id, kind: 'branch' as const })),
      ...newAnnotations.map((e) => ({ id: e.id, kind: 'annotation' as const })),
      ...newTags.map((e) => ({ id: e.id, kind: 'tag' as const })),
      ...newClamps.map((e) => ({ id: e.id, kind: 'clamp' as const })),
      ...newMeasurements.map((e) => ({ id: e.id, kind: 'measurement' as const })),
    ];
    const single = created.length === 1 ? created[0] : null;

    set((st) => ({
      lines: [...st.lines, ...newLines],
      symbols: [...st.symbols, ...newSymbols],
      bends: [...st.bends, ...newBends],
      transitions: [...st.transitions, ...newTransitions],
      branches: [...st.branches, ...newBranches],
      annotations: [...st.annotations, ...newAnnotations],
      tags: [...st.tags, ...newTags],
      clamps: [...st.clamps, ...newClamps],
      measurements: [...st.measurements, ...newMeasurements],
      // Kopiene blir det nye utvalget: en ny kopi-operasjon gjentar dermed
      // forskyvningen videre, og egenskapspanelet redigerer kopien, ikke originalen.
      multiSelection: single ? new Set<string>() : new Set(created.map((c) => c.id)),
      selectedId: single ? single.id : null,
      selectedKind: single ? single.kind : null,
    }));
  },

  updateManyLineProps: (ids, patch) => {
    if (ids.length === 0) return;
    recordHistory();
    const idSet = new Set(ids);
    set((s) => {
      const lines = s.lines.map((l) => {
        if (!idSet.has(l.id)) return l;
        const next = { ...l, ...patch };
        if (patch.subId) {
          const sub = SUBCATEGORIES[patch.subId];
          if (!sub.materials.includes(next.material)) next.material = sub.materials[0];
          if (!sub.dimensions.includes(next.dimension)) next.dimension = sub.dimensions[0];
        }
        return next;
      });
      if (patch.dimension === undefined && patch.subId === undefined) return { lines };
      return { lines, transitions: syncTransitionsAtJoints(lines, s.transitions, s.currentPage, idSet) };
    });
  },

  // nudgeSelected/moveSingleLine/moveSelection er nå alle tynne skall over
  // planMove/applyMovePlan (definert øverst i filen), slik at piltastene og
  // Flytt-verktøyet garantert bruker nøyaktig samme utregning.
  nudgeSelected: (dx, dy, recordAsNewStep) => {
    const s = get();
    // Speiler den historiske semantikken til nudgeSelected: kun linjer sås inn (ikke
    // frittstående symboler/tagger/klammer), selv om et flervalg skulle inneholde slikt.
    const lineIds = new Set(
      s.multiSelection.size > 0
        ? Array.from(s.multiSelection).filter((id) => s.lines.some((l) => l.id === id))
        : s.selectedKind === 'line' && s.selectedId
          ? [s.selectedId]
          : [],
    );
    const plan = planMove({ ...s, multiSelection: lineIds, selectedId: null }, { forceRigid: true });
    if (!plan) return;
    if (recordAsNewStep) recordHistory();
    set(applyMovePlan(s, plan, dx, dy));
  },

  moveSingleLine: (lineId, dx, dy, recordAsNewStep) => {
    const s = get();
    if (!s.lines.some((l) => l.id === lineId && l.page === s.currentPage)) return;
    if (recordAsNewStep) recordHistory();
    set(applyMovePlan(s, { mode: 'single', lineId, lineIds: new Set([lineId]), bendIds: new Set(), transitionIds: new Set(), branchIds: new Set(), tagIds: new Set(), symbolIds: new Set(), clampIds: new Set(), annotationIds: new Set(), measurementIds: new Set() }, dx, dy));
  },

  moveSelection: (dx, dy, recordAsNewStep = true) => {
    const s = get();
    const plan = planMove(s);
    if (!plan) return;
    if (recordAsNewStep) recordHistory();
    set(applyMovePlan(s, plan, dx, dy));
  },

  setView: (v) => set({ view: v }),
  setStageSize: (size) => set({ stageSize: size }),
  zoomBy: (factor) =>
    set((s) => {
      const newScale = clampScale(s.view.scale * factor);
      // Zoom rundt midten av det synlige lerretet (ikke origo), slik at tegningen
      // ikke hopper mot øvre venstre hjørne når man klikker +/- gjentatte ganger.
      const cx = s.stageSize.width / 2;
      const cy = s.stageSize.height / 2;
      const worldX = (cx - s.view.x) / s.view.scale;
      const worldY = (cy - s.view.y) / s.view.scale;
      return {
        view: {
          scale: newScale,
          x: cx - worldX * newScale,
          y: cy - worldY * newScale,
        },
      };
    }),
  requestFit: () => set((s) => ({ fitSignal: s.fitSignal + 1 })),
  setPrintImage: (dataUrl) => set({ printImage: dataUrl }),

  exportSnapshot: () => {
    const s = get();
    return {
      lines: s.lines,
      symbols: s.symbols,
      transitions: s.transitions,
      branches: s.branches,
      bends: s.bends,
      annotations: s.annotations,
      tags: s.tags,
      clamps: s.clamps,
      measurements: s.measurements,
      scale: s.scale,
      lineConfig: s.lineConfig,
      symbolConfig: s.symbolConfig,
      fileName: s.fileName,
      numPages: s.numPages,
      currentPage: s.currentPage,
    };
  },

  importSnapshot: (snapshot) => {
    if (!snapshot) {
      set({
        lines: [],
        symbols: [],
        transitions: [],
        branches: [],
        bends: [],
        annotations: [],
        tags: [],
        clamps: [],
        measurements: [],
        scale: initialScale,
        autoDetected: null,
        lineConfig: {},
        symbolConfig: {},
        fileName: null,
        numPages: 0,
        currentPage: 1,
        multiSelection: new Set<string>(),
        history: { past: [], future: [] },
      });
      return;
    }
    set({
      lines: snapshot.lines,
      symbols: snapshot.symbols,
      transitions: snapshot.transitions,
      branches: snapshot.branches ?? [],
      bends: snapshot.bends ?? [],
      annotations: snapshot.annotations ?? [],
      tags: snapshot.tags ?? [],
      clamps: snapshot.clamps ?? [],
      measurements: snapshot.measurements ?? [],
      scale: snapshot.scale,
      lineConfig: snapshot.lineConfig,
      symbolConfig: snapshot.symbolConfig ?? {},
      fileName: snapshot.fileName,
      numPages: snapshot.numPages,
      currentPage: snapshot.currentPage,
      multiSelection: new Set<string>(),
      history: { past: [], future: [] },
    });
  },

  resetWorkspace: () =>
    set({
      pdfDoc: null,
      fileName: null,
      numPages: 0,
      currentPage: 1,
      pageImage: null,
      pageWidth: 0,
      pageHeight: 0,
      isLoading: false,
      error: null,
      scale: initialScale,
      autoDetected: null,
      isScanning: false,
      lines: [],
      symbols: [],
      transitions: [],
      branches: [],
      bends: [],
      annotations: [],
      tags: [],
      clamps: [],
      measurements: [],
      tool: 'select',
      selectedId: null,
      selectedKind: null,
      lineConfig: {},
      symbolConfig: {},
      hoveredSymbolId: null,
      multiSelection: new Set<string>(),
      hiddenCategories: new Set<string>(),
      history: { past: [], future: [] },
      historyPaused: false,
      pendingBranchChoice: null,
      pendingOffLineSymbol: null,
      view: { scale: 1, x: 0, y: 0 },
      scaleDialogOpen: false,
      scaleDialogTab: 'manual',
      calibrationDistancePx: null,
      settingsDialogOpen: false,
      focusMode: false,
    }),
  };
});

export function clampScale(scale: number): number {
  return Math.min(Math.max(scale, 0.1), 8);
}
