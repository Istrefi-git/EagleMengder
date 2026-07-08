// Delt mengdeberegning – brukes av både QuantityPanel.tsx (skjermvisning) og
// eksport (Excel/utskrift), slik at skjerm og eksportert fil garantert viser
// samme tall siden de bygges fra samme kilde.

import type {
  BendEntity,
  BranchEntity,
  LineEntity,
  ScaleState,
  SymbolDef,
  SymbolEntity,
  SymbolType,
  TransitionEntity,
} from '../types';
import {
  CATEGORIES,
  SUBCATEGORIES,
  SYMBOL_DEFS,
  SYMBOL_TYPE_ORDER,
  branchFittingLabel,
  categoryOf,
  jointCountForLength,
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
  rows: QuantityRow[];
}

export function buildQuantityReport(
  lines: LineEntity[],
  symbols: SymbolEntity[],
  transitions: TransitionEntity[],
  branches: BranchEntity[],
  scale: ScaleState,
  standardLengths: { pipe: number; duct: number },
  bends: BendEntity[] = [],
): QuantityReport {
  const mpp = scale.metersPerPixel;

  const subTotal: Record<string, number> = {};
  const subCount: Record<string, number> = {};
  const subDetail: Record<string, Record<string, number>> = {};
  const bendCounts: Record<string, number> = {};
  const jointCounts: Record<string, number> = {};
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
    const key = `${line.material} · ${line.dimension}`;
    (subDetail[line.subId] ??= {})[key] = (subDetail[line.subId]?.[key] ?? 0) + mm;
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
  for (const sym of symbols) {
    symbolCounts[sym.type] += 1;
    const def = SYMBOL_DEFS[sym.type];
    const key = symbolDetailKey(def, sym.props);
    const detail = (symbolDetail[sym.type] ??= {});
    detail[key] = (detail[key] ?? 0) + 1;
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
  for (const t of transitions) {
    const sub = SUBCATEGORIES[t.subId];
    const cat = categoryOf(t.subId);
    const key = `${sub?.label ?? t.subId} · ${t.material} · ${t.fromDimension} → ${t.toDimension}`;
    transitionCounts[key] = (transitionCounts[key] ?? 0) + 1;
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
  for (const b of branches) {
    const sub = SUBCATEGORIES[b.subId];
    const cat = categoryOf(b.subId);
    const globalBranchKey = `${sub?.label ?? b.subId} · ${b.material} · ${b.dimension}→${b.branchDimension} · ${branchFittingLabel(b.fittingType)}`;
    branchCounts[globalBranchKey] = (branchCounts[globalBranchKey] ?? 0) + 1;
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
    rows,
  };
}

export function categoryTotalMm(report: QuantityReport, catCode: string): number {
  const cat = CATEGORIES.find((c) => c.code === catCode);
  if (!cat) return 0;
  return cat.subs.reduce((a, sub) => a + (report.subTotal[sub.id] ?? 0), 0);
}
