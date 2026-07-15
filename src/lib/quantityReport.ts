// Delt mengdeberegning – brukes av både QuantityPanel.tsx (skjermvisning) og
// eksport (Excel/utskrift), slik at skjerm og eksportert fil garantert viser
// samme tall siden de bygges fra samme kilde.

import type {
  BendEntity,
  BranchEntity,
  ClampEntity,
  LineEntity,
  ScaleState,
  SymbolDef,
  SymbolEntity,
  SymbolType,
  TransitionEntity,
} from '../types';
import {
  CATEGORIES,
  CLAMP_ROD_LENGTH_MM,
  DEFAULT_CLAMP_ROD_DIAMETER,
  SUBCATEGORIES,
  SYMBOL_DEFS,
  SYMBOL_TYPE_ORDER,
  branchFittingLabel,
  categoryOf,
  jointCountForLength,
  rodLabel,
  jointLabel,
} from '../types';
import { classifyBendAngle, polylineBendAngles, polylineLength } from './geometry';
import { lengthMm } from './scale';

/** Bygger en beskrivende nøkkel for et symbols konfigurerte egenskaper (dimensjon,
 * lengde, luftmengde osv.), slik at like konfigurerte instanser slås sammen til én
 * rad («2 stk») mens ulikt konfigurerte vises hver for seg. Tomme/null-tallverdier
 * (f.eks. uoppgitt luftmengde/effekt) utelates for å unngå støy. */
function symbolDetailKey(def: SymbolDef, props: Record<string, string | number>): string {
  const parts: string[] = [];
  for (const f of def.fields) {
    const v = props[f.key];
    if (v === undefined || v === null || v === '') continue;
    if (f.kind === 'number' && Number(v) === 0) continue;
    parts.push(f.unit ? `${v}${f.unit}` : String(v));
  }
  return parts.length > 0 ? parts.join(' · ') : 'Standard';
}

/** Én rad i den flate eksport-vennlige rapporten (Excel/utskrift). */
export interface QuantityRow {
  system: string;
  underkategori: string;
  materiale: string;
  dimensjon: string;
  lengdeMm: number;
  antall: number;
  type: string;
}

export interface QuantityReport {
  subTotal: Record<string, number>;
  subCount: Record<string, number>;
  subDetail: Record<string, Record<string, number>>;
  totalBends: number;
  totalJoints: number;
  symbolCounts: Record<SymbolType, number>;
  /** Utstyr summert per utstyrstype + de faktiske feltverdiene (dimensjon, lengde,
   * luftmengde osv.) i stedet for bare ett samlet antall – slik at f.eks. to
   * Ø315×900mm-lyddempere vises som én rad («2 stk»), atskilt fra andre dimensjoner. */
  symbolDetail: Partial<Record<SymbolType, Record<string, number>>>;
  /** Flate, tvers-av-alle-underkategorier oppsummeringer for «Automatisk genererte
   * deler»-blokken – summert på underkategori + materiale + dimensjon (+ vinkel for
   * bend, fra→til for overganger/avgreininger), slik at f.eks. to like Ø250 45°-bend
   * på samme kanaltype vises som én rad («2 stk»). */
  bendCounts: Record<string, number>;
  jointCounts: Record<string, number>;
  branchCounts: Record<string, number>;
  transitionCounts: Record<string, number>;
  /** Klammer (bæring) – summert per underkategori+materiale+dimensjon, samme mønster som
   * bendCounts osv. */
  clampCounts: Record<string, number>;
  totalClamps: number;
  /** Gjengestag summert per diameter (mm) → antall klammer + total lengde (mm). Slik at
   * en blandet tegning kan vise «Ø8mm gjengestag», «Ø12mm gjengestag» osv. hver for seg. */
  rodTotals: Record<number, { count: number; lengthMm: number }>;
  rows: QuantityRow[];
  /** Entitets-id-er bak hver rad, brukt til å utheve alt tegnet av samme type i
   * mengdelisten når man klikker en rad (se QuantityPanel). Nøklene her matcher
   * nøklene i subDetail/symbolDetail/bendCounts/jointCounts/branchCounts/
   * transitionCounts 1:1. «Skjøter» (nippel/muffe) har ingen egen entitet – der
   * peker id-ene til linjen(e) skjøten gjelder for. Legacy flerpunkts-bend (ingen
   * egen BendEntity) peker tilsvarende til vertslinjen. */
  subLineIds: Record<string, string[]>;
  subDetailIds: Record<string, Record<string, string[]>>;
  symbolDetailIds: Partial<Record<SymbolType, Record<string, string[]>>>;
  bendIds: Record<string, string[]>;
  jointIds: Record<string, string[]>;
  branchIds: Record<string, string[]>;
  transitionIds: Record<string, string[]>;
  clampIds: Record<string, string[]>;
}

function pushId(map: Record<string, string[]>, key: string, id: string) {
  (map[key] ??= []).push(id);
}

export function buildQuantityReport(
  lines: LineEntity[],
  symbols: SymbolEntity[],
  transitions: TransitionEntity[],
  branches: BranchEntity[],
  scale: ScaleState,
  standardLengths: { pipe: number; duct: number },
  bends: BendEntity[] = [],
  clamps: ClampEntity[] = [],
): QuantityReport {
  const mpp = scale.metersPerPixel;

  const subTotal: Record<string, number> = {};
  const subCount: Record<string, number> = {};
  const subDetail: Record<string, Record<string, number>> = {};
  const bendCounts: Record<string, number> = {};
  const jointCounts: Record<string, number> = {};
  const subLineIds: Record<string, string[]> = {};
  const subDetailIds: Record<string, Record<string, string[]>> = {};
  const bendIds: Record<string, string[]> = {};
  const jointIds: Record<string, string[]> = {};
  let totalBends = 0;
  let totalJoints = 0;
  const rows: QuantityRow[] = [];

  for (const line of lines) {
    const sub = SUBCATEGORIES[line.subId];
    const cat = categoryOf(line.subId);
    const system = cat ? `${cat.code} ${cat.label}` : line.subId;
    const mm = lengthMm(polylineLength(line.points), mpp);
    subTotal[line.subId] = (subTotal[line.subId] ?? 0) + mm;
    subCount[line.subId] = (subCount[line.subId] ?? 0) + 1;
    pushId(subLineIds, line.subId, line.id);
    const key = `${line.material} · ${line.dimension}`;
    (subDetail[line.subId] ??= {})[key] = (subDetail[line.subId]?.[key] ?? 0) + mm;
    pushId((subDetailIds[line.subId] ??= {}), key, line.id);
    rows.push({
      system,
      underkategori: sub?.label ?? line.subId,
      materiale: line.material,
      dimensjon: line.dimension,
      lengdeMm: Math.round(mm),
      antall: 1,
      type: cat?.kind === 'duct' ? 'Kanallengde' : 'Rørlengde',
    });

    // Bakoverkompatibilitet: eldre lagrede linjer kan fortsatt være flerpunkts-polylinjer
    // (fra før hvert rett strekk ble sitt eget segment) – deres bend leses fortsatt ut av
    // selve geometrien. Nytt-tegnede linjer er alltid 2-punkts, så dette gir aldri duplikater.
    const legacyBends = polylineBendAngles(line.points);
    for (const b of legacyBends) {
      const angle = classifyBendAngle(b.angleDeg);
      const globalBendKey = `${sub?.label ?? line.subId} · ${line.material} · ${line.dimension} · ${angle}° bend`;
      bendCounts[globalBendKey] = (bendCounts[globalBendKey] ?? 0) + 1;
      pushId(bendIds, globalBendKey, line.id);
      totalBends += 1;
      rows.push({
        system,
        underkategori: sub?.label ?? line.subId,
        materiale: line.material,
        dimensjon: line.dimension,
        lengdeMm: 0,
        antall: 1,
        type: `Bend ${angle}°`,
      });
    }

    const kind = cat?.kind;
    if (kind) {
      const joints = jointCountForLength(mm, standardLengths[kind]);
      if (joints > 0) {
        const label = jointLabel(kind);
        const globalJointKey = `${sub?.label ?? line.subId} · ${line.material} · ${line.dimension} · ${label}`;
        jointCounts[globalJointKey] = (jointCounts[globalJointKey] ?? 0) + joints;
        pushId(jointIds, globalJointKey, line.id);
        totalJoints += joints;
        rows.push({
          system,
          underkategori: sub?.label ?? line.subId,
          materiale: line.material,
          dimensjon: line.dimension,
          lengdeMm: 0,
          antall: joints,
          type: label,
        });
      }
    }
  }

  for (const b of bends) {
    const sub = SUBCATEGORIES[b.subId];
    const cat = categoryOf(b.subId);
    const system = cat ? `${cat.code} ${cat.label}` : b.subId;
    const globalBendKey = `${sub?.label ?? b.subId} · ${b.material} · ${b.dimension} · ${b.angleDeg}° bend`;
    bendCounts[globalBendKey] = (bendCounts[globalBendKey] ?? 0) + 1;
    pushId(bendIds, globalBendKey, b.id);
    totalBends += 1;
    rows.push({
      system,
      underkategori: sub?.label ?? b.subId,
      materiale: b.material,
      dimensjon: b.dimension,
      lengdeMm: 0,
      antall: 1,
      type: `Bend ${b.angleDeg}°`,
    });
  }

  const symbolCounts: Record<SymbolType, number> = SYMBOL_TYPE_ORDER.reduce(
    (acc, t) => ({ ...acc, [t]: 0 }),
    {} as Record<SymbolType, number>,
  );
  const symbolDetail: Partial<Record<SymbolType, Record<string, number>>> = {};
  const symbolDetailIds: Partial<Record<SymbolType, Record<string, string[]>>> = {};
  for (const sym of symbols) {
    symbolCounts[sym.type] += 1;
    const def = SYMBOL_DEFS[sym.type];
    const key = symbolDetailKey(def, sym.props);
    const detail = (symbolDetail[sym.type] ??= {});
    detail[key] = (detail[key] ?? 0) + 1;
    pushId((symbolDetailIds[sym.type] ??= {}), key, sym.id);
  }
  for (const t of SYMBOL_TYPE_ORDER) {
    const detail = symbolDetail[t];
    if (!detail) continue;
    for (const [key, count] of Object.entries(detail)) {
      rows.push({
        system: 'Komponenter',
        underkategori: SYMBOL_DEFS[t].label,
        materiale: '',
        dimensjon: key === 'Standard' ? '' : key,
        lengdeMm: 0,
        antall: count,
        type: 'Komponent',
      });
    }
  }

  const transitionCounts: Record<string, number> = {};
  const transitionIds: Record<string, string[]> = {};
  for (const t of transitions) {
    const sub = SUBCATEGORIES[t.subId];
    const cat = categoryOf(t.subId);
    const key = `${sub?.label ?? t.subId} · ${t.material} · ${t.fromDimension} → ${t.toDimension}`;
    transitionCounts[key] = (transitionCounts[key] ?? 0) + 1;
    pushId(transitionIds, key, t.id);
    rows.push({
      system: cat ? `${cat.code} ${cat.label}` : t.subId,
      underkategori: sub?.label ?? t.subId,
      materiale: t.material,
      dimensjon: `${t.fromDimension} → ${t.toDimension}`,
      lengdeMm: 0,
      antall: 1,
      type: 'Overgang',
    });
  }

  const branchCounts: Record<string, number> = {};
  const branchIds: Record<string, string[]> = {};
  for (const b of branches) {
    const sub = SUBCATEGORIES[b.subId];
    const cat = categoryOf(b.subId);
    const globalBranchKey = `${sub?.label ?? b.subId} · ${b.material} · ${b.dimension}→${b.branchDimension} · ${branchFittingLabel(b.fittingType)}`;
    branchCounts[globalBranchKey] = (branchCounts[globalBranchKey] ?? 0) + 1;
    pushId(branchIds, globalBranchKey, b.id);
    rows.push({
      system: cat ? `${cat.code} ${cat.label}` : b.subId,
      underkategori: sub?.label ?? b.subId,
      materiale: b.material,
      dimensjon: `${b.dimension} → ${b.branchDimension}`,
      lengdeMm: 0,
      antall: 1,
      type: branchFittingLabel(b.fittingType),
    });
  }

  const clampCounts: Record<string, number> = {};
  const clampIds: Record<string, string[]> = {};
  const rodTotals: Record<number, { count: number; lengthMm: number }> = {};
  let totalClamps = 0;
  for (const c of clamps) {
    const line = lines.find((l) => l.id === c.lineId);
    const subId = line?.subId ?? '';
    const sub = SUBCATEGORIES[subId];
    const cat = categoryOf(subId);
    const material = line?.material ?? '';
    const key = `${sub?.label ?? subId} · ${material} · ${c.dimension}`;
    clampCounts[key] = (clampCounts[key] ?? 0) + 1;
    pushId(clampIds, key, c.id);
    totalClamps += 1;
    const dia = c.rodDiameter ?? DEFAULT_CLAMP_ROD_DIAMETER;
    const rodLen = c.rodLengthMm ?? CLAMP_ROD_LENGTH_MM;
    const rt = (rodTotals[dia] ??= { count: 0, lengthMm: 0 });
    rt.count += 1;
    rt.lengthMm += rodLen;
    const system = cat ? `${cat.code} ${cat.label}` : subId;
    rows.push({
      system,
      underkategori: sub?.label ?? subId,
      materiale: material,
      dimensjon: c.dimension,
      lengdeMm: 0,
      antall: 1,
      type: 'Klammer',
    });
    rows.push({
      system,
      underkategori: sub?.label ?? subId,
      materiale: material,
      dimensjon: c.dimension,
      lengdeMm: rodLen,
      antall: 1,
      type: rodLabel(dia),
    });
  }

  return {
    subTotal,
    subCount,
    subDetail,
    totalBends,
    totalJoints,
    symbolCounts,
    symbolDetail,
    bendCounts,
    jointCounts,
    branchCounts,
    transitionCounts,
    clampCounts,
    totalClamps,
    rodTotals,
    rows,
    subLineIds,
    subDetailIds,
    symbolDetailIds,
    bendIds,
    jointIds,
    branchIds,
    transitionIds,
    clampIds,
  };
}

export function categoryTotalMm(report: QuantityReport, catCode: string): number {
  const cat = CATEGORIES.find((c) => c.code === catCode);
  if (!cat) return 0;
  return cat.subs.reduce((a, sub) => a + (report.subTotal[sub.id] ?? 0), 0);
}
