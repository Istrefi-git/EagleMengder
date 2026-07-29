import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { useStore } from '../store';
import {
  DECOR_FLOOR,
  FULLPAGE_COVERAGE,
  LINEWORK_FLOOR,
  MAX_TEXT_ITEMS,
  analyzePage,
  analyzePageCached,
} from '../lib/pdfAnalysis';
import type { PdfContentType, PdfPageAnalysis } from '../lib/pdfAnalysis';
import { extractGeometry, findSnapCandidates, getGeometryLayer, getSegment } from '../lib/pdfGeometry';
import type { GeometryLayer } from '../lib/pdfGeometry';

/** Diagnostikk for fase 1: viser hva den opplastede PDF-en faktisk inneholder.
 *  Rent lesende – ingenting herfra påvirker tegningen eller mengdelisten. */
export function PdfAnalysisDialog() {
  const open = useStore((s) => s.pdfAnalysisDialogOpen);
  const close = useStore((s) => s.closePdfAnalysisDialog);
  const pdfDoc = useStore((s) => s.pdfDoc);
  const currentPage = useStore((s) => s.currentPage);
  const numPages = useStore((s) => s.numPages);
  const fileName = useStore((s) => s.fileName);

  const [analysis, setAnalysis] = useState<PdfPageAnalysis | null>(null);
  const [geometry, setGeometry] = useState<GeometryLayer | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!open || !pdfDoc) return;
    let cancelled = false;
    cancelledRef.current = false;
    setBusy(true);
    setError(null);
    setAnalysis(null);
    setGeometry(null);

    analyzePageCached(pdfDoc, currentPage, { shouldCancel: () => cancelledRef.current })
      .then((res) => {
        if (!cancelled) setAnalysis(res);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
      cancelledRef.current = true;
    };
  }, [open, pdfDoc, currentPage]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const copyJson = useCallback(() => {
    if (!analysis) return;
    void navigator.clipboard.writeText(JSON.stringify(analysis, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [analysis]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal pdf-analysis" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>PDF-analyse</h2>
          <button className="btn icon" onClick={close}>
            <X size={15} />
          </button>
        </div>

        <div className="modal-body">
          {!pdfDoc && <p className="note">Ingen tegning er lastet inn.</p>}
          {busy && <p className="note">Analyserer side {currentPage}…</p>}
          {error && <p className="pa-error">Analysen feilet: {error}</p>}

          {analysis && (
            <>
              <Section title="Dokument">
                <Stats
                  rows={[
                    ['Filnavn', fileName || '—'],
                    ['Side', `${analysis.pageNumber} av ${numPages}`],
                    ['Sidestørrelse', `${round(analysis.widthPt)} × ${round(analysis.heightPt)} pt`],
                    ['Bildepiksler', `${analysis.widthPx} × ${analysis.heightPx} px`],
                    ['Rotasjon', `${analysis.rotation}°`],
                    ['Render-skala', `${analysis.renderScale}×`],
                  ]}
                />
              </Section>

              <Section title="Klassifisering">
                <div className={`pa-badge ${analysis.contentType}`}>
                  {contentTypeLabel(analysis.contentType)}
                </div>
                <p className="pa-reason">{analysis.classificationReason}</p>
                <p className="note">
                  Terskler: linjeverk ≥ {LINEWORK_FLOOR} primitiver, dekorasjon ≥ {DECOR_FLOOR},
                  helsidebilde ≥ {Math.round(FULLPAGE_COVERAGE * 100)} % dekning.
                </p>
              </Section>

              <Section title="Geometri">
                <Stats
                  rows={[
                    ['Rette segmenter', num(analysis.paths.segments)],
                    ['– linjesegmenter', num(analysis.paths.lineSegments)],
                    ['– rektangelkanter', num(analysis.paths.rectEdgeSegments)],
                    ['– lukkesegmenter', num(analysis.paths.closeSegments)],
                    ['Kurver (kun telt i fase 1)', num(analysis.paths.curves)],
                    ['Delbaner', num(analysis.paths.subpaths)],
                    ['Rektangler', num(analysis.paths.rectangles)],
                    ['Aksejusterte segmenter', num(analysis.paths.axisAlignedSegments)],
                    ['Samlet strekklengde', `${num(Math.round(analysis.paths.totalStraightLengthPx))} px`],
                    ['constructPath-ops', num(analysis.paths.constructPathOps)],
                    ['Strøkne baner', num(analysis.paths.strokedPaths)],
                    ['Fylte baner', num(analysis.paths.filledPaths)],
                    ['Klippebaner (ekskludert)', num(analysis.paths.clipPaths)],
                    [
                      'Linjeverk-utstrekning',
                      analysis.linework.bbox
                        ? `${round(analysis.linework.bbox.minX)}, ${round(analysis.linework.bbox.minY)} → ` +
                          `${round(analysis.linework.bbox.maxX)}, ${round(analysis.linework.bbox.maxY)} ` +
                          `(${Math.round(analysis.linework.coverage * 100)} % av siden)`
                        : '—',
                    ],
                  ]}
                />
              </Section>

              <Section title="Tekst">
                <Stats
                  rows={[
                    ['Kilde', analysis.text.sourceId === 'embedded' ? 'Innebygd PDF-tekst' : 'OCR'],
                    ['Tekstobjekter', num(analysis.text.itemCount)],
                    ['Tegn totalt', num(analysis.text.charCount)],
                  ]}
                />
                {analysis.text.items.length > 0 && (
                  <div className="pa-table-wrap">
                    <table className="pa-table">
                      <thead>
                        <tr>
                          <th>Tekst</th>
                          <th>X</th>
                          <th>Y</th>
                          <th>Str.</th>
                          <th>Rot.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.text.items.map((t, i) => (
                          <tr key={i}>
                            <td className="pa-text-cell">{t.text}</td>
                            <td>{round(t.x)}</td>
                            <td>{round(t.y)}</td>
                            <td>{round(t.fontSizePx)}</td>
                            <td>{round(t.rotationDeg)}°</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {analysis.text.itemCount > MAX_TEXT_ITEMS && (
                  <p className="note">
                    Viser de første {MAX_TEXT_ITEMS} av {num(analysis.text.itemCount)} tekstobjektene.
                  </p>
                )}
              </Section>

              <Section title="Bilder">
                <Stats
                  rows={[
                    ['Antall bilder', num(analysis.images.count)],
                    ['– bildemasker (1-bit)', num(analysis.images.maskCount)],
                    ['– inline', num(analysis.images.inlineCount)],
                    ['Største dekning', `${Math.round(analysis.images.largestCoverage * 100)} %`],
                    ['Samlet dekning', `${Math.round(analysis.images.totalCoverage * 100)} %`],
                  ]}
                />
              </Section>

              <Section title="Geometry Layer">
                {!geometry && (
                  <>
                    <p className="note">
                      Trekker ut PDF-ens egen vektorgeometri med utflatede kurver, og bygger
                      indeksen snappingen skal bruke. Kjøres på forespørsel, siden det koster mer
                      enn selve analysen.
                    </p>
                    <button
                      className="btn"
                      disabled={geoBusy || !pdfDoc}
                      onClick={() => {
                        if (!pdfDoc) return;
                        setGeoBusy(true);
                        getGeometryLayer(pdfDoc, currentPage)
                          .then(setGeometry)
                          .catch((err: Error) => setError(err.message))
                          .finally(() => setGeoBusy(false));
                      }}
                    >
                      {geoBusy ? 'Trekker ut…' : 'Bygg geometrilag'}
                    </button>
                  </>
                )}
                {geometry && (
                  <>
                    <Stats
                      rows={[
                        ['Segmenter (etter utflating)', num(geometry.segmentCount)],
                        ['Rå segmenter fra walker', num(geometry.stats.rawSegments)],
                        ['Forkastet degenererte', num(geometry.stats.droppedDegenerate)],
                        ['Klippebaner hoppet over', num(geometry.stats.clipPathsSkipped)],
                        ['Bézier-kurver flatet ut', num(geometry.stats.curves)],
                        ['Unike endepunkter', num(geometry.endpointCount)],
                        ['Rutenett', `${geometry.grid.cols} × ${geometry.grid.rows} celler`],
                        ['Cellestørrelse', `${round(geometry.grid.cellSize)} px`],
                        ['Indeksoppføringer', num(geometry.grid.cellItems.length)],
                        ['Uttrekkstid', `${geometry.durationMs.toFixed(1)} ms`],
                        [
                          'Utstrekning',
                          geometry.bbox
                            ? `${round(geometry.bbox.minX)}, ${round(geometry.bbox.minY)} → ` +
                              `${round(geometry.bbox.maxX)}, ${round(geometry.bbox.maxY)}`
                            : '—',
                        ],
                        [
                          'Minnebruk (koordinater)',
                          `${(geometry.coords.byteLength / 1024).toFixed(0)} KB`,
                        ],
                      ]}
                    />
                    {geometry.truncated && (
                      <p className="pa-error">
                        Geometriuttrekket er avkortet – tegningen har flere segmenter enn taket.
                      </p>
                    )}
                  </>
                )}
              </Section>

              <Section title="Ytelse og forbehold">
                <Stats
                  rows={[
                    ['Analysetid', `${analysis.durationMs.toFixed(1)} ms`],
                    ['Operatorer', num(analysis.operatorCount)],
                    ['Maks form-XObject-dybde', num(analysis.maxFormDepth)],
                    ['Marked content-seksjoner', num(analysis.markedContentSections)],
                  ]}
                />
                {analysis.truncated && (
                  <p className="pa-error">
                    Analysen er avkortet – tallene over er ufullstendige.
                  </p>
                )}
                {analysis.warnings.map((w, i) => (
                  <p className="pa-warning" key={i}>
                    {w}
                  </p>
                ))}
              </Section>

              <details className="pa-details">
                <summary>Rå JSON</summary>
                <button className="btn" onClick={copyJson}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Kopiert' : 'Kopier JSON'}
                </button>
                <pre className="pa-json">{JSON.stringify(analysis, null, 2)}</pre>
              </details>
            </>
          )}

          {/* Selvtesten bygger sine egne PDF-er, så den skal være tilgjengelig
              også uten en lastet tegning. */}
          {import.meta.env.DEV && <SelfTest />}
        </div>
      </div>
    </div>
  );
}

// ── Selvtest (kun dev) ──────────────────────────────────────────────────
//
// Kjører analysen mot syntetiske PDF-er der hvert forventet tall er utledet
// for hånd, og asserterer. Dette er det som faktisk beviser at CTM-stakken,
// markør-aritmetikken og koordinatavbildningen er riktige.

interface TestResult {
  variant: string;
  label: string;
  passed: number;
  failed: { assertion: string; expected: string; actual: string }[];
}

function SelfTest() {
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      // Kun fixturen lastes dynamisk – den skal ikke inn i produksjonsbygget.
      // pdfAnalysis/pdf er allerede statisk importert av denne komponenten.
      const { buildSyntheticPdf, SYNTHETIC_EXPECTATIONS, SYNTHETIC_VARIANTS } = await import(
        '../lib/devFixtures/syntheticPdf'
      );
      const { loadPdf } = await import('../lib/pdf');

      const out: TestResult[] = [];
      const EPS = 1e-6;

      for (const variant of SYNTHETIC_VARIANTS) {
        const exp = SYNTHETIC_EXPECTATIONS[variant];
        const failed: TestResult['failed'] = [];
        let passed = 0;

        const check = (assertion: string, expected: unknown, actual: unknown, ok: boolean) => {
          if (ok) passed++;
          else failed.push({ assertion, expected: String(expected), actual: String(actual) });
        };
        const eq = (a: string, e: number | string | undefined, actual: number | string) => {
          if (e === undefined) return;
          check(a, e, actual, typeof e === 'number' && typeof actual === 'number'
            ? Math.abs(e - actual) < EPS
            : e === actual);
        };

        const bytes = buildSyntheticPdf(variant);
        // getDocument overtar/nuller bufferet, så gi den en egen kopi.
        const doc = await loadPdf(bytes.slice().buffer);
        const a = await analyzePage(doc, 1);

        eq('contentType', exp.contentType, a.contentType);
        eq('widthPx', exp.widthPx, a.widthPx);
        eq('heightPx', exp.heightPx, a.heightPx);
        eq('subpaths', exp.subpaths, a.paths.subpaths);
        eq('segments', exp.segments, a.paths.segments);
        eq('lineSegments', exp.lineSegments, a.paths.lineSegments);
        eq('rectangles', exp.rectangles, a.paths.rectangles);
        eq('rectEdgeSegments', exp.rectEdgeSegments, a.paths.rectEdgeSegments);
        eq('curves', exp.curves, a.paths.curves);
        eq('strokedPaths', exp.strokedPaths, a.paths.strokedPaths);
        eq('clipPaths', exp.clipPaths, a.paths.clipPaths);
        eq('images.count', exp.imageCount, a.images.count);

        if (exp.minLargestCoverage !== undefined) {
          check(
            'images.largestCoverage',
            `>= ${exp.minLargestCoverage}`,
            a.images.largestCoverage.toFixed(4),
            a.images.largestCoverage >= exp.minLargestCoverage,
          );
        }

        if (exp.segmentCoords) {
          exp.segmentCoords.forEach(([x1, y1, x2, y2], i) => {
            const s = a.linework.sample[i];
            const ok =
              !!s &&
              Math.abs(s.x1 - x1) < EPS &&
              Math.abs(s.y1 - y1) < EPS &&
              Math.abs(s.x2 - x2) < EPS &&
              Math.abs(s.y2 - y2) < EPS;
            check(
              `segment[${i}]`,
              `(${x1},${y1})→(${x2},${y2})`,
              s ? `(${s.x1},${s.y1})→(${s.x2},${s.y2})` : 'mangler',
              ok,
            );
          });
        }

        for (const t of exp.textAt ?? []) {
          const hit = a.text.items.find((x) => x.text === t.text);
          const ok =
            !!hit &&
            Math.abs(hit.x - t.x) < EPS &&
            Math.abs(hit.y - t.y) < EPS &&
            Math.abs(hit.fontSizePx - t.fontSizePx) < EPS;
          check(
            `tekst "${t.text}"`,
            `x=${t.x} y=${t.y} str=${t.fontSizePx}`,
            hit ? `x=${hit.x} y=${hit.y} str=${hit.fontSizePx}` : 'mangler',
            ok,
          );
        }

        for (const needle of exp.textContains ?? []) {
          const ok = a.text.items.some((x) => x.text.includes(needle));
          check(`tekst inneholder "${needle}"`, needle, ok ? 'funnet' : 'mangler', ok);
        }

        // ── Geometry Layer (fase 2) ──
        const needsGeo =
          exp.geoCurves !== undefined ||
          exp.geoMinSegments !== undefined ||
          exp.geoHasPoint ||
          exp.geoSnap ||
          exp.geoNoSnap;

        if (needsGeo) {
          const layer = await extractGeometry(doc, 1);

          eq('geo.curves', exp.geoCurves, layer.stats.curves);

          if (exp.geoMinSegments !== undefined) {
            check(
              'geo.segmentCount',
              `>= ${exp.geoMinSegments}`,
              layer.segmentCount,
              layer.segmentCount >= exp.geoMinSegments,
            );
          }

          for (const [px, py] of exp.geoHasPoint ?? []) {
            let found = false;
            for (let i = 0; i < layer.segmentCount && !found; i++) {
              const s = getSegment(layer, i);
              if (
                (Math.abs(s.x1 - px) < 1e-6 && Math.abs(s.y1 - py) < 1e-6) ||
                (Math.abs(s.x2 - px) < 1e-6 && Math.abs(s.y2 - py) < 1e-6)
              ) {
                found = true;
              }
            }
            check(`geo punkt (${px},${py})`, 'finnes', found ? 'funnet' : 'mangler', found);
          }

          for (const q of exp.geoSnap ?? []) {
            const cands = findSnapCandidates(layer, q.at[0], q.at[1], q.radius);
            const hit = cands.find((c) => c.kind === q.kind);
            const ok =
              !!hit &&
              Math.abs(hit.x - q.expect[0]) < 1e-6 &&
              Math.abs(hit.y - q.expect[1]) < 1e-6;
            check(
              `snap ${q.kind} @(${q.at[0]},${q.at[1]})`,
              `(${q.expect[0]},${q.expect[1]})`,
              hit ? `(${hit.x},${hit.y})` : 'ingen treff',
              ok,
            );
          }

          for (const q of exp.geoNoSnap ?? []) {
            const cands = findSnapCandidates(layer, q.at[0], q.at[1], q.radius);
            const hit = cands.find((c) => c.kind === q.kind);
            check(
              `INGEN ${q.kind} @(${q.at[0]},${q.at[1]})`,
              'ingen treff',
              hit ? `fantom (${hit.x},${hit.y})` : 'ingen treff',
              !hit,
            );
          }
        }

        out.push({ variant, label: exp.label, passed, failed });
      }
      setResults(out);
    } finally {
      setRunning(false);
    }
  }

  const totalFailed = results?.reduce((n, r) => n + r.failed.length, 0) ?? 0;

  return (
    <div className="pa-selftest">
      <div className="pa-section-title">Selvtest (kun utvikling)</div>
      <p className="note">
        Kjører analysen mot syntetiske PDF-er med håndutledede fasitverdier. Beviser at
        parseren er korrekt – sier ingenting om hvordan ekte tegninger klassifiseres.
      </p>
      <button className="btn" onClick={() => void run()} disabled={running}>
        {running ? 'Kjører…' : 'Kjør selvtest'}
      </button>

      {results && (
        <>
          <div className={`pa-selftest-summary ${totalFailed === 0 ? 'ok' : 'fail'}`}>
            {totalFailed === 0
              ? `Alle ${results.reduce((n, r) => n + r.passed, 0)} assertene passerte.`
              : `${totalFailed} assert(er) feilet.`}
          </div>
          {results.map((r) => (
            <div className="pa-selftest-row" key={r.variant}>
              <strong>
                {r.failed.length === 0 ? '✓' : '⚠'} {r.variant}
              </strong>{' '}
              <span className="note">
                {r.label} — {r.passed} ok, {r.failed.length} feil
              </span>
              {r.failed.map((f, i) => (
                <div className="pa-selftest-fail" key={i}>
                  {f.assertion}: forventet <code>{f.expected}</code>, fikk <code>{f.actual}</code>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Små presentasjonshjelpere ───────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pa-section">
      <div className="pa-section-title">{title}</div>
      {children}
    </div>
  );
}

function Stats({ rows }: { rows: [string, string][] }) {
  return (
    <div className="pa-stats">
      {rows.map(([k, v]) => (
        <div className="pa-stat" key={k}>
          <span>{k}</span>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  );
}

function contentTypeLabel(t: PdfContentType): string {
  switch (t) {
    case 'vector':
      return 'Vektorbasert';
    case 'raster':
      return 'Rasterbasert';
    case 'mixed':
      return 'Blandet';
    case 'empty':
      return 'Tom side';
  }
}

function num(n: number): string {
  return n.toLocaleString('nb-NO');
}

function round(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('nb-NO');
}
