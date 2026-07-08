import { ArrowRightLeft, CornerUpRight, GitFork, Link2, Maximize2, Minimize2 } from 'lucide-react';
import { useStore } from '../store';
import { CATEGORIES, SYMBOL_DEFS, SYMBOL_TYPE_ORDER, colorFor } from '../types';
import { buildQuantityReport, categoryTotalMm } from '../lib/quantityReport';
import { formatMm } from '../lib/scale';

export function QuantityPanel() {
  const lines = useStore((s) => s.lines);
  const symbols = useStore((s) => s.symbols);
  const transitions = useStore((s) => s.transitions);
  const branches = useStore((s) => s.branches);
  const bends = useStore((s) => s.bends);
  const customColors = useStore((s) => s.customColors);
  const scale = useStore((s) => s.scale);
  const standardLengths = useStore((s) => s.standardLengths);
  const focusMode = useStore((s) => s.focusMode);
  const toggleFocusMode = useStore((s) => s.toggleFocusMode);
  const mpp = scale.metersPerPixel;

  const report = buildQuantityReport(lines, symbols, transitions, branches, scale, standardLengths, bends);
  const {
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
  } = report;

  // Vis kun kategorier/underkategorier som faktisk har noe tegnet – mengdelisten
  // skal speile prosjektet, ikke fungere som en alltid-full katalog.
  const visibleCategories = CATEGORIES.filter((cat) => categoryTotalMm(report, cat.code) > 0);
  const hasAnyData = visibleCategories.length > 0;
  const totalAutoCount = totalBends + totalJoints + branches.length + transitions.length;

  return (
    <section className="quantity-panel">
      <div className="panel-header">
        <h3>Mengdeliste</h3>
        <div className="panel-header-actions">
          {mpp == null && <span className="badge warn">Sett målestokk</span>}
          <button
            className="btn icon"
            onClick={toggleFocusMode}
            title={focusMode ? 'Vis tegneverktøy igjen (Esc)' : 'Vis kun mengdeliste'}
          >
            {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {!hasAnyData && (
        <p className="muted qty-empty-note qty-empty-root">
          Ingen mengder registrert ennå. Velg et rør/kanal-verktøy i venstre meny og
          tegn på PDF-en for å se mengder her.
        </p>
      )}

      {visibleCategories.map((cat) => (
        <div key={cat.code} className="qty-block">
          <div className="qty-block-title">
            <span>
              <span className="qty-cat-code">{cat.code}</span> {cat.label}
            </span>
            <span className="qty-total">{formatMm(categoryTotalMm(report, cat.code))}</span>
          </div>
          {cat.subs.filter((sub) => subCount[sub.id] > 0).map((sub) => {
            const detail = subDetail[sub.id];
            const subColor = colorFor(sub, customColors);
            return (
              <div key={sub.id} className="qty-sub">
                <div className="qty-row">
                  <span className="qty-label">
                    <span
                      className="qty-swatch"
                      style={{
                        background: cat.kind === 'duct' ? 'transparent' : subColor,
                        borderColor: subColor,
                        borderStyle: cat.kind === 'duct' ? 'dashed' : 'solid',
                      }}
                    />
                    {sub.label}
                    {subCount[sub.id] > 0 && <span className="qty-count">×{subCount[sub.id]}</span>}
                  </span>
                  <span className="qty-value">{formatMm(subTotal[sub.id] ?? 0)}</span>
                </div>
                {detail &&
                  Object.entries(detail).map(([key, mm]) => (
                    <div key={key} className="qty-detail">
                      <span>{key}</span>
                      <span className="qty-value">{formatMm(mm)}</span>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      ))}

      {totalAutoCount > 0 && (
        <div className="qty-block">
          <div className="qty-block-title">
            <span>Automatisk genererte deler</span>
          </div>
          <div
            className="qty-row"
            title="Telles automatisk ut fra retningsendringer i tegnede rør/kanaler."
          >
            <span className="qty-label">
              <CornerUpRight size={13} className="qty-auto-icon" />
              Bend
            </span>
            <span className="qty-value">{totalBends} stk</span>
          </div>
          {totalBends > 0 &&
            Object.entries(bendCounts).map(([key, count]) => (
              <div key={key} className="qty-detail bend">
                <span>{key}</span>
                <span className="qty-value">{count} stk</span>
              </div>
            ))}
          <div
            className="qty-row"
            title="Nippel legges til for kanaler over standardlengden, muffe for rør."
          >
            <span className="qty-label">
              <Link2 size={13} className="qty-auto-icon" />
              Skjøter (Nippel/Muffe)
            </span>
            <span className="qty-value">{totalJoints} stk</span>
          </div>
          {totalJoints > 0 &&
            Object.entries(jointCounts).map(([key, count]) => (
              <div key={key} className="qty-detail joint">
                <span>{key}</span>
                <span className="qty-value">{count} stk</span>
              </div>
            ))}
          <div
            className="qty-row"
            title="Settes inn når du tegner et nytt rør/kanal videre fra et eksisterende."
          >
            <span className="qty-label">
              <GitFork size={13} className="qty-auto-icon" />
              Avgreininger
            </span>
            <span className="qty-value">{branches.length} stk</span>
          </div>
          {branches.length > 0 &&
            Object.entries(branchCounts).map(([key, count]) => (
              <div key={key} className="qty-detail branch">
                <span>{key}</span>
                <span className="qty-value">{count} stk</span>
              </div>
            ))}
          <div
            className="qty-row"
            title="Legges til når du bytter dimensjon midt i en tegning."
          >
            <span className="qty-label">
              <ArrowRightLeft size={13} className="qty-auto-icon" />
              Overganger
            </span>
            <span className="qty-value">{transitions.length} stk</span>
          </div>
          {transitions.length > 0 &&
            Object.entries(transitionCounts).map(([key, count]) => (
              <div key={key} className="qty-detail">
                <span>{key}</span>
                <span className="qty-value">{count} stk</span>
              </div>
            ))}
        </div>
      )}

      {symbols.length > 0 && (
        <div className="qty-block">
          <div className="qty-block-title">
            <span>Komponenter</span>
            <span className="qty-total">{symbols.length} stk</span>
          </div>
          {SYMBOL_TYPE_ORDER.filter((t) => symbolCounts[t] > 0).map((t) => (
            <div key={t}>
              <div className="qty-row">
                <span className="qty-label">
                  <span className="qty-swatch comp" />
                  {SYMBOL_DEFS[t].label}
                </span>
                <span className="qty-value">{symbolCounts[t]} stk</span>
              </div>
              {Object.entries(symbolDetail[t] ?? {}).map(([key, count]) => (
                <div key={key} className="qty-detail comp">
                  <span>{key}</span>
                  <span className="qty-value">{count} stk</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
