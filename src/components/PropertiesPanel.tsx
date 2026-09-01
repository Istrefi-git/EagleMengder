import { Trash2 } from 'lucide-react';
import { findConnectedLineIds, useStore } from '../store';
import {
  CATEGORIES,
  CLAMP_ROD_DIAMETERS,
  CLAMP_ROD_LENGTH_MM,
  DEFAULT_CLAMP_ROD_DIAMETER,
  SUBCATEGORIES,
  TEXT_ANNOTATION_TYPES,
  annotationTypeLabel,
  branchFittingLabel,
  categoryOf,
  colorFor,
  mergedDimensions,
  dimensionsForMaterial,
  symbolDefFor,
  tagLabel,
} from '../types';
import { polygonArea, polylineLength } from '../lib/geometry';
import { formatAreaM2, formatLengthMm } from '../lib/scale';

export function PropertiesPanel() {
  const selectedId = useStore((s) => s.selectedId);
  const selectedKind = useStore((s) => s.selectedKind);
  const lines = useStore((s) => s.lines);
  const symbols = useStore((s) => s.symbols);
  const transitions = useStore((s) => s.transitions);
  const branches = useStore((s) => s.branches);
  const bends = useStore((s) => s.bends);
  const annotations = useStore((s) => s.annotations);
  const tags = useStore((s) => s.tags);
  const clamps = useStore((s) => s.clamps);
  const caps = useStore((s) => s.caps);
  const measurements = useStore((s) => s.measurements);
  const updateAnnotation = useStore((s) => s.updateAnnotation);
  const scale = useStore((s) => s.scale);
  const updateLineProps = useStore((s) => s.updateLineProps);
  const updateSymbol = useStore((s) => s.updateSymbol);
  const deleteSelected = useStore((s) => s.deleteSelected);
  const updateClampProps = useStore((s) => s.updateClampProps);
  const multiSelection = useStore((s) => s.multiSelection);
  const clearMultiSelection = useStore((s) => s.clearMultiSelection);
  const deleteMany = useStore((s) => s.deleteMany);
  const updateManyLineProps = useStore((s) => s.updateManyLineProps);
  const customSystems = useStore((s) => s.customSystems);
  const customComponents = useStore((s) => s.customComponents);
  const customDimensions = useStore((s) => s.customDimensions);
  const customColors = useStore((s) => s.customColors);

  if (multiSelection.size > 0) {
    const ids = Array.from(multiSelection);
    const selectedLines = lines.filter((l) => ids.includes(l.id));
    const totalPx = selectedLines.reduce((acc, l) => acc + polylineLength(l.points), 0);
    const commonSubId = selectedLines.every((l) => l.subId === selectedLines[0]?.subId)
      ? selectedLines[0]?.subId
      : null;
    const sub = commonSubId ? SUBCATEGORIES[commonSubId] : null;
    const commonMaterial = selectedLines.every((l) => l.material === selectedLines[0]?.material)
      ? selectedLines[0]?.material
      : undefined;
    // «Strekning» når HELE utvalget er linjer OG de henger sammen som ÉN komponent
    // (samme regel dobbeltklikk-på-kroppen bruker, se PdfCanvas' selectConnectedRun) –
    // ikke bare et vilkårlig gummibånd-utvalg av flere separate rør/kanaler.
    const isOneRun =
      selectedLines.length === ids.length &&
      ids.length > 0 &&
      findConnectedLineIds(selectedLines, [selectedLines[0].id]).size === selectedLines.length;
    return (
      <section className="properties-panel">
        <div className="panel-header">
          <h3>
            {isOneRun ? `Strekning · ${ids.length} ${ids.length === 1 ? 'segment' : 'segmenter'}` : `${ids.length} valgt`}
          </h3>
        </div>
        <div className="field readonly">
          <span>Samlet lengde</span>
          <strong>{formatLengthMm(totalPx, scale.metersPerPixel)}</strong>
        </div>
        {sub && (
          <>
            <label className="field">
              <span>Materiale / rørtype (alle)</span>
              <select
                value=""
                onChange={(e) =>
                  e.target.value && updateManyLineProps(ids, { material: e.target.value })
                }
              >
                <option value="" disabled>
                  Velg…
                </option>
                {sub.materials.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Dimensjon (alle)</span>
              <select
                value=""
                onChange={(e) =>
                  e.target.value && updateManyLineProps(ids, { dimension: e.target.value })
                }
              >
                <option value="" disabled>
                  Velg…
                </option>
                {(commonMaterial
                  ? dimensionsForMaterial(sub, commonMaterial, customDimensions)
                  : mergedDimensions(sub, customDimensions)
                ).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            {customSystems.length > 0 && (
              <label className="field">
                <span>System (alle)</span>
                <select
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return; // "Velg…"-plassholderen – ingen endring
                    updateManyLineProps(ids, { systemId: v === '__clear__' ? undefined : v });
                  }}
                >
                  <option value="" disabled>
                    Velg…
                  </option>
                  <option value="__clear__">Ingen</option>
                  {customSystems.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        {!sub && (
          <p className="muted">
            Velg objekter i samme underkategori for å bytte materiale/dimensjon for alle samtidig.
          </p>
        )}
        <button className="btn full" onClick={clearMultiSelection}>
          Fjern utvalg
        </button>
        <button className="btn danger full" onClick={() => deleteMany(ids)}>
          <Trash2 size={15} />
          Slett alle ({ids.length})
        </button>
      </section>
    );
  }

  if (!selectedId) {
    return (
      <section className="properties-panel empty">
        <div className="panel-header">
          <h3>Egenskaper</h3>
        </div>
        <p className="muted">Velg en linje eller et symbol for å redigere egenskaper.</p>
      </section>
    );
  }

  if (selectedKind === 'line') {
    const line = lines.find((l) => l.id === selectedId);
    if (!line) return null;
    const sub = SUBCATEGORIES[line.subId];
    const cat = categoryOf(line.subId);
    const lenPx = polylineLength(line.points);
    const subColor = colorFor(sub, customColors);
    return (
      <section className="properties-panel">
        <div className="panel-header">
          <h3>Egenskaper – linje</h3>
          <span className="badge cat" style={{ borderColor: subColor, color: subColor }}>
            {cat.code}
          </span>
        </div>
        <label className="field">
          <span>Kategori / system</span>
          <select
            value={line.subId}
            onChange={(e) => updateLineProps(line.id, { subId: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <optgroup key={c.code} label={`${c.code} ${c.label}`}>
                {c.subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Materiale / rørtype</span>
          <select
            value={line.material}
            onChange={(e) => {
              const material = e.target.value;
              const dims = dimensionsForMaterial(sub, material, customDimensions);
              // Bytter man mellom rund og rektangulær rørtype, nullstill dimensjonen til
              // første gyldige verdi hvis den gamle ikke finnes i det nye settet.
              updateLineProps(
                line.id,
                dims.includes(line.dimension) ? { material } : { material, dimension: dims[0] },
              );
            }}
          >
            {sub.materials.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Dimensjon</span>
          <select
            value={line.dimension}
            onChange={(e) => updateLineProps(line.id, { dimension: e.target.value })}
          >
            {dimensionsForMaterial(sub, line.material, customDimensions).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        {customSystems.length > 0 && (
          <label className="field">
            <span>System (valgfritt)</span>
            <select
              value={line.systemId ?? ''}
              onChange={(e) => updateLineProps(line.id, { systemId: e.target.value || undefined })}
            >
              <option value="">Ingen</option>
              {customSystems.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="field readonly">
          <span>Lengde</span>
          <strong>{formatLengthMm(lenPx, scale.metersPerPixel)}</strong>
        </div>
        <div className="field readonly">
          <span>Knekkpunkter</span>
          <strong>{line.points.length / 2}</strong>
        </div>
        <button className="btn danger full" onClick={deleteSelected}>
          <Trash2 size={15} />
          Slett linje
        </button>
      </section>
    );
  }

  if (selectedKind === 'transition') {
    const t = transitions.find((tr) => tr.id === selectedId);
    if (!t) return null;
    return (
      <section className="properties-panel">
        <div className="panel-header">
          <h3>Egenskaper – Overgang</h3>
        </div>
        <div className="field readonly">
          <span>System</span>
          <strong>{SUBCATEGORIES[t.subId]?.label ?? t.subId}</strong>
        </div>
        <div className="field readonly">
          <span>Materiale</span>
          <strong>{t.material}</strong>
        </div>
        <div className="field readonly">
          <span>Dimensjon</span>
          <strong>{t.fromDimension} → {t.toDimension}</strong>
        </div>
        <button className="btn danger full" onClick={deleteSelected}>
          <Trash2 size={15} />
          Slett overgang
        </button>
      </section>
    );
  }

  if (selectedKind === 'branch') {
    const b = branches.find((br) => br.id === selectedId);
    if (!b) return null;
    return (
      <section className="properties-panel">
        <div className="panel-header">
          <h3>Egenskaper – Avgreining</h3>
        </div>
        <div className="field readonly">
          <span>System</span>
          <strong>{SUBCATEGORIES[b.subId]?.label ?? b.subId}</strong>
        </div>
        <div className="field readonly">
          <span>Type</span>
          <strong>{branchFittingLabel(b.fittingType)}</strong>
        </div>
        <div className="field readonly">
          <span>Materiale</span>
          <strong>{b.material}</strong>
        </div>
        <div className="field readonly">
          <span>Dimensjon</span>
          <strong>{b.dimension} → {b.branchDimension}</strong>
        </div>
        <button className="btn danger full" onClick={deleteSelected}>
          <Trash2 size={15} />
          Slett avgreining
        </button>
      </section>
    );
  }

  if (selectedKind === 'bend') {
    const bend = bends.find((bd) => bd.id === selectedId);
    if (!bend) return null;
    return (
      <section className="properties-panel">
        <div className="panel-header">
          <h3>Egenskaper – Bend</h3>
        </div>
        <div className="field readonly">
          <span>System</span>
          <strong>{SUBCATEGORIES[bend.subId]?.label ?? bend.subId}</strong>
        </div>
        <div className="field readonly">
          <span>Materiale</span>
          <strong>{bend.material}</strong>
        </div>
        <div className="field readonly">
          <span>Dimensjon</span>
          <strong>{bend.dimension}</strong>
        </div>
        <div className="field readonly">
          <span>Vinkel</span>
          <strong>{bend.angleDeg}°</strong>
        </div>
        <button className="btn danger full" onClick={deleteSelected}>
          <Trash2 size={15} />
          Slett bend
        </button>
      </section>
    );
  }

  if (selectedKind === 'annotation') {
    const note = annotations.find((a) => a.id === selectedId);
    if (!note) return null;
    const label = annotationTypeLabel(note.type);
    const isText = TEXT_ANNOTATION_TYPES.has(note.type);
    const hasText = note.type === 'text' || note.type === 'textbox' || note.type === 'callout';
    return (
      <section className="properties-panel">
        <div className="panel-header">
          <h3>Egenskaper – {label}</h3>
        </div>
        {hasText && (
          <label className="field">
            <span>Tekst</span>
            <textarea
              value={note.text ?? ''}
              onChange={(e) => updateAnnotation(note.id, { text: e.target.value })}
              rows={3}
            />
          </label>
        )}
        <label className="field">
          <span>Farge</span>
          <input
            type="color"
            value={note.color}
            onChange={(e) => updateAnnotation(note.id, { color: e.target.value })}
          />
        </label>
        {isText ? (
          <label className="field">
            <span>Skriftstørrelse</span>
            <input
              type="number"
              min={8}
              max={48}
              value={note.fontSize ?? 14}
              onChange={(e) => updateAnnotation(note.id, { fontSize: Number(e.target.value) })}
            />
          </label>
        ) : note.type === 'highlight' ? (
          <label className="field">
            <span>Styrke</span>
            <input
              type="range"
              min={0.1}
              max={0.8}
              step={0.05}
              value={note.opacity ?? 0.35}
              onChange={(e) => updateAnnotation(note.id, { opacity: Number(e.target.value) })}
            />
          </label>
        ) : (
          <label className="field">
            <span>Tykkelse</span>
            <input
              type="number"
              min={1}
              max={20}
              value={note.strokeWidth ?? 2}
              onChange={(e) => updateAnnotation(note.id, { strokeWidth: Number(e.target.value) })}
            />
          </label>
        )}
        <button className="btn danger full" onClick={deleteSelected}>
          <Trash2 size={15} />
          Slett {label.toLowerCase()}
        </button>
      </section>
    );
  }

  if (selectedKind === 'tag') {
    const tag = tags.find((t) => t.id === selectedId);
    if (!tag) return null;
    const line = lines.find((l) => l.id === tag.lineId);
    return (
      <section className="properties-panel">
        <div className="panel-header">
          <h3>Egenskaper – Tag</h3>
        </div>
        <div className="field readonly">
          <span>Festet til</span>
          <strong>{line ? `${SUBCATEGORIES[line.subId]?.label ?? line.subId}` : 'Slettet linje'}</strong>
        </div>
        {line && (
          <div className="field readonly">
            <span>Viser</span>
            <strong>{tagLabel(line)}</strong>
          </div>
        )}
        <button className="btn danger full" onClick={deleteSelected}>
          <Trash2 size={15} />
          Slett tag
        </button>
      </section>
    );
  }

  if (selectedKind === 'clamp') {
    const clamp = clamps.find((c) => c.id === selectedId);
    if (!clamp) return null;
    const line = lines.find((l) => l.id === clamp.lineId);
    return (
      <section className="properties-panel">
        <div className="panel-header">
          <h3>Egenskaper – Klammer</h3>
        </div>
        <div className="field readonly">
          <span>Festet til</span>
          <strong>{line ? `${SUBCATEGORIES[line.subId]?.label ?? line.subId}` : 'Slettet linje'}</strong>
        </div>
        <div className="field readonly">
          <span>Dimensjon</span>
          <strong>{clamp.dimension}</strong>
        </div>
        <label className="field">
          <span>Gjengestag – diameter</span>
          <select
            value={clamp.rodDiameter ?? DEFAULT_CLAMP_ROD_DIAMETER}
            onChange={(e) => updateClampProps(clamp.id, { rodDiameter: Number(e.target.value) })}
          >
            {CLAMP_ROD_DIAMETERS.map((d) => (
              <option key={d} value={d}>
                Ø{d} mm
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Gjengestag – lengde</span>
          <input
            type="number"
            min={50}
            step={10}
            value={clamp.rodLengthMm ?? CLAMP_ROD_LENGTH_MM}
            onChange={(e) => updateClampProps(clamp.id, { rodLengthMm: Number(e.target.value) })}
          />
        </label>
        <button className="btn danger full" onClick={deleteSelected}>
          <Trash2 size={15} />
          Slett klammer
        </button>
      </section>
    );
  }

  if (selectedKind === 'cap') {
    const cap = caps.find((c) => c.id === selectedId);
    if (!cap) return null;
    const line = lines.find((l) => l.id === cap.lineId);
    return (
      <section className="properties-panel">
        <div className="panel-header">
          <h3>Egenskaper – Blending</h3>
        </div>
        <div className="field readonly">
          <span>Blender enden på</span>
          <strong>{line ? `${SUBCATEGORIES[line.subId]?.label ?? line.subId}` : 'Slettet kanal'}</strong>
        </div>
        <p className="muted">
          Så lenge denne blendingen står kan man ikke tegne videre fra denne enden. Slett
          blendingen for å åpne den igjen.
        </p>
        <button className="btn danger full" onClick={deleteSelected}>
          <Trash2 size={15} />
          Fjern blending
        </button>
      </section>
    );
  }

  if (selectedKind === 'measurement') {
    const measurement = measurements.find((m) => m.id === selectedId);
    if (!measurement) return null;
    const isArea = measurement.type === 'area';
    const value = isArea
      ? formatAreaM2(polygonArea(measurement.points), scale.metersPerPixel)
      : formatLengthMm(polylineLength(measurement.points), scale.metersPerPixel);
    return (
      <section className="properties-panel">
        <div className="panel-header">
          <h3>Egenskaper – {isArea ? 'Areal' : 'Avstand'}</h3>
        </div>
        <div className="field readonly">
          <span>{isArea ? 'Areal' : 'Lengde'}</span>
          <strong>{value}</strong>
        </div>
        <button className="btn danger full" onClick={deleteSelected}>
          <Trash2 size={15} />
          Slett måling
        </button>
      </section>
    );
  }

  // symbol
  const sym = symbols.find((s) => s.id === selectedId);
  if (!sym) return null;
  const def = symbolDefFor(sym.type, customComponents);
  if (!def) {
    return (
      <section className="properties-panel">
        <div className="panel-header">
          <h3>Ukjent komponent</h3>
        </div>
        <p className="muted">
          Denne komponenten er slettet fra biblioteket. Du kan fortsatt fjerne den fra tegningen.
        </p>
        <button className="btn danger full" onClick={deleteSelected}>
          <Trash2 size={15} />
          Slett symbol
        </button>
      </section>
    );
  }
  return (
    <section className="properties-panel">
      <div className="panel-header">
        <h3>Egenskaper – {def.label}</h3>
      </div>
      {sym.mountedLineId && (
        <div className="field readonly">
          <span>Montert i</span>
          <strong>Rør/kanal</strong>
        </div>
      )}
      {def.fields.map((f) => (
        <label key={f.key} className="field">
          <span>
            {f.label}
            {f.unit ? ` (${f.unit})` : ''}
          </span>
          {f.kind === 'select' ? (
            <select
              value={String(sym.props[f.key] ?? f.default)}
              onChange={(e) => updateSymbol(sym.id, { props: { [f.key]: e.target.value } })}
            >
              {f.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : f.kind === 'number' ? (
            <input
              type="number"
              value={Number(sym.props[f.key] ?? f.default)}
              onChange={(e) => updateSymbol(sym.id, { props: { [f.key]: Number(e.target.value) } })}
            />
          ) : (
            <input
              type="text"
              value={String(sym.props[f.key] ?? f.default)}
              onChange={(e) => updateSymbol(sym.id, { props: { [f.key]: e.target.value } })}
            />
          )}
        </label>
      ))}
      <label className="field">
        <span>Rotasjon</span>
        <input
          type="range"
          min={0}
          max={360}
          step={15}
          value={sym.rotation}
          onChange={(e) => updateSymbol(sym.id, { rotation: Number(e.target.value) })}
        />
        <em className="range-value">{sym.rotation}°</em>
      </label>
      {customSystems.length > 0 && (
        <label className="field">
          <span>System (valgfritt)</span>
          <select
            value={sym.systemId ?? ''}
            onChange={(e) => updateSymbol(sym.id, { systemId: e.target.value || undefined })}
          >
            <option value="">Ingen</option>
            {customSystems.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="btn danger full" onClick={deleteSelected}>
        <Trash2 size={15} />
        Slett symbol
      </button>
    </section>
  );
}
