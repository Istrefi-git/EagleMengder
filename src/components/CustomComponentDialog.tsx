import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useStore } from '../store';
import type { GlyphShapeId, SymbolFieldDef } from '../types';
import { GlyphPreview } from './GlyphPreview';

interface Props {
  onClose: () => void;
}

const GLYPH_SHAPES: GlyphShapeId[] = [
  'valve_bowtie',
  'valve_bowtie_filled',
  'damper',
  'damper_labeled',
  'diffuser',
  'silencer_box',
  'fan',
  'circle',
  'box',
  'diamond',
  'triangle',
  'cross',
  'cap_end',
];

interface DraftField {
  label: string;
  kind: SymbolFieldDef['kind'];
  unit: string;
  optionsText: string;
}

/** Sluffer en label til en stabil felt-nøkkel (a-z0-9, camelCase-ish), med et
 * indeks-fallback for tomme/rent-symbolske labels. */
function slugify(label: string, index: number): string {
  const s = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/[^a-z0-9]/g, '');
  return s || `felt${index}`;
}

/** Modal for å lage en egendefinert komponent: navn, grunnform, farge, rør/kanal,
 * og en fritt konfigurerbar feltliste (samme skjema som innebygde symboler bruker –
 * SymbolFieldDef). Lagres i brukerens globale bibliotek via addCustomComponent. */
export function CustomComponentDialog({ onClose }: Props) {
  const addCustomComponent = useStore((s) => s.addCustomComponent);

  const [label, setLabel] = useState('');
  const [glyphShape, setGlyphShape] = useState<GlyphShapeId>('circle');
  const [color, setColor] = useState('#14C08A');
  const [kind, setKind] = useState<'pipe' | 'duct'>('pipe');
  const [fields, setFields] = useState<DraftField[]>([
    { label: 'Dimensjon', kind: 'text', unit: '', optionsText: '' },
  ]);

  function addField() {
    setFields((f) => [...f, { label: '', kind: 'text', unit: '', optionsText: '' }]);
  }
  function updateField(i: number, patch: Partial<DraftField>) {
    setFields((f) => f.map((field, idx) => (idx === i ? { ...field, ...patch } : field)));
  }
  function removeField(i: number) {
    setFields((f) => f.filter((_, idx) => idx !== i));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    const fieldDefs: SymbolFieldDef[] = fields
      .filter((f) => f.label.trim())
      .map((f, i) => {
        const options = f.kind === 'select' ? f.optionsText.split(',').map((o) => o.trim()).filter(Boolean) : undefined;
        return {
          key: slugify(f.label, i),
          label: f.label.trim(),
          kind: f.kind,
          unit: f.unit.trim() || undefined,
          options,
          default: f.kind === 'number' ? 0 : options?.[0] ?? '',
        };
      });
    addCustomComponent({ label: label.trim(), kind, glyphShape, color, fields: fieldDefs });
    onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal custom-component-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Ny komponent</h2>
          <button className="btn icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <label className="field">
            <span>Navn</span>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="f.eks. Balanseringsventil" autoFocus required />
          </label>

          <div className="field">
            <span>Grunnform</span>
            <div className="tool-grid glyph-shape-grid">
              {GLYPH_SHAPES.map((shape) => (
                <button
                  type="button"
                  key={shape}
                  className={`tool-grid-item ${glyphShape === shape ? 'active' : ''}`}
                  onClick={() => setGlyphShape(shape)}
                  title={shape}
                >
                  <GlyphPreview shape={shape} color={color} />
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span>Farge</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>

          <div className="field">
            <span>Type</span>
            <div className="radio-row">
              <label className="radio-chip">
                <input type="radio" checked={kind === 'pipe'} onChange={() => setKind('pipe')} />
                Rør
              </label>
              <label className="radio-chip">
                <input type="radio" checked={kind === 'duct'} onChange={() => setKind('duct')} />
                Kanal
              </label>
            </div>
          </div>

          <div className="field">
            <span>Felter</span>
            {fields.map((f, i) => (
              <div key={i} className="custom-component-field-row">
                <input
                  type="text"
                  value={f.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  placeholder="Feltnavn (f.eks. Kv-verdi)"
                />
                <select value={f.kind} onChange={(e) => updateField(i, { kind: e.target.value as DraftField['kind'] })}>
                  <option value="text">Tekst</option>
                  <option value="number">Tall</option>
                  <option value="select">Valgliste</option>
                </select>
                {f.kind === 'select' ? (
                  <input
                    type="text"
                    value={f.optionsText}
                    onChange={(e) => updateField(i, { optionsText: e.target.value })}
                    placeholder="Verdier, kommaseparert"
                  />
                ) : (
                  <input
                    type="text"
                    value={f.unit}
                    onChange={(e) => updateField(i, { unit: e.target.value })}
                    placeholder="Enhet (valgfritt)"
                  />
                )}
                <button type="button" className="btn icon" onClick={() => removeField(i)} title="Fjern felt">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button type="button" className="btn" onClick={addField}>
              <Plus size={14} />
              Legg til felt
            </button>
          </div>

          <button className="btn primary full" type="submit">
            Lagre i mitt bibliotek
          </button>
        </form>
      </div>
    </div>
  );
}
