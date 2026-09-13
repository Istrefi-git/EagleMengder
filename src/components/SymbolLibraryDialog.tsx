import { useState } from 'react';
import { Plus, Search, Trash2, X } from 'lucide-react';
import { useStore } from '../store';
import { BUILTIN_SYMBOL_GLYPH, SYMBOL_DEFS } from '../types';
import type { BuiltInSymbolType, SymbolDef } from '../types';
import { SYMBOL_ICONS } from './Toolbar';
import { GlyphPreview } from './GlyphPreview';
import { CustomComponentDialog } from './CustomComponentDialog';

interface Props {
  onClose: () => void;
}

/** Kategoriseringen som vises i venstrekolonnen i biblioteket – dekker alle 47
 * innebygde symboltyper (de 16 opprinnelige + 31 nyere), gruppert etter hvor de
 * naturlig hører hjemme i en VVS-tegning. Rekkefølgen innad i en gruppe er ikke
 * viktig – selve symbolene hentes fra SYMBOL_DEFS. */
const LIBRARY_GROUPS: { label: string; types: BuiltInSymbolType[] }[] = [
  {
    label: 'Ventiler (rør)',
    types: [
      'tee',
      'tee_equal',
      'shutoff_valve',
      'angle_shutoff_valve',
      'control_valve',
      'motor_valve',
      'check_valve',
      'shunt_valve',
      'safety_valve',
      'pressure_reducing_valve',
      'drain_valve',
      'air_vent',
      'reduction',
      'bend_90',
      'bend_45',
    ],
  },
  { label: 'Måleinstrumenter', types: ['manometer', 'thermometer', 'water_meter'] },
  { label: 'Varme/energisentral', types: ['heat_exchanger', 'expansion_tank', 'circulation_pump', 'filter'] },
  { label: 'Spjeld (kanal)', types: ['damper', 'vav_damper', 'cav_damper', 'control_damper', 'fire_damper', 'balancing_damper'] },
  {
    label: 'Ventiler/diffusorer (kanal)',
    types: ['supply_diffuser', 'extract_diffuser', 'ceiling_diffuser', 'wall_diffuser', 'grille', 'fresh_air_tower', 'roof_hood'],
  },
  { label: 'Kanaldeler', types: ['duct_bend_90', 'round_rect_transition', 'measurement_point', 'condensate_drain'] },
  {
    label: 'Aggregater/varmegjenvinning',
    types: ['fan', 'air_handling_unit', 'duct_heater', 'cooling_coil', 'heating_coil', 'rotary_heat_exchanger', 'cross_heat_exchanger'],
  },
  { label: 'Lyddempere', types: ['silencer'] },
];

const CUSTOM_GROUP = '__custom';

/** Rør/ventilasjon-filteret over kategorikolonnen – SymbolDef.kind finnes allerede på
 * alle innebygde typer og på egendefinerte komponenter, denne dialogen brukte den
 * bare aldri til noe før nå. */
type KindFilter = 'all' | 'pipe' | 'duct';
const KIND_FILTER_LABEL: Record<KindFilter, string> = { all: 'Alle', pipe: 'Rør', duct: 'Ventilasjon' };

/** Søkbart, kategorisert symbolbibliotek – erstatter de to flate ikon-gridene
 * («Komponenter – Ventilasjon»/«Komponenter – Rør») som lå direkte i Toolbar.
 * Valg av symbol setter `tool` akkurat som før (`symbol:<type>`); presentasjonen
 * er det eneste som er nytt. Egendefinerte komponenter (CustomComponentDef)
 * oppfører seg identisk med innebygde her. */
export function SymbolLibraryDialog({ onClose }: Props) {
  const setTool = useStore((s) => s.setTool);
  const customComponents = useStore((s) => s.customComponents);
  const removeCustomComponent = useStore((s) => s.removeCustomComponent);

  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [newComponentOpen, setNewComponentOpen] = useState(false);

  const q = search.trim().toLowerCase();
  const matchesKind = (def: SymbolDef | { kind: 'pipe' | 'duct' }) =>
    kindFilter === 'all' || def.kind === kindFilter;

  function choose(type: string) {
    setTool(`symbol:${type}`);
    onClose();
  }

  const builtinTypes =
    activeGroup && activeGroup !== CUSTOM_GROUP
      ? LIBRARY_GROUPS.find((g) => g.label === activeGroup)?.types ?? []
      : activeGroup === CUSTOM_GROUP
        ? []
        : LIBRARY_GROUPS.flatMap((g) => g.types);

  const filteredBuiltins = builtinTypes
    .map((t) => SYMBOL_DEFS[t])
    .filter((def) => matchesKind(def) && (!q || def.label.toLowerCase().includes(q)));

  const filteredCustom = customComponents.filter(
    (c) => matchesKind(c) && (!q || c.label.toLowerCase().includes(q)),
  );

  // Egendefinerte komponenter vises alltid i «Alle» og i «Mine komponenter» – de skal
  // ikke kreve at man først skriver et søk for å dukke opp (rettet kvirk).
  const showCustom = activeGroup === CUSTOM_GROUP || activeGroup === null;
  const showBuiltins = activeGroup !== CUSTOM_GROUP;
  // Skjul en kategori-knapp helt når gjeldende rør/ventilasjon-filter tømmer den – en
  // «Ventiler (rør)»-knapp som ikke viser noe under «Ventilasjon»-filteret er bare støy.
  const visibleGroups = LIBRARY_GROUPS.filter(
    (g) => kindFilter === 'all' || g.types.some((t) => SYMBOL_DEFS[t].kind === kindFilter),
  );

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal symbol-library" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Symbolbibliotek</h2>
          <button className="btn icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body symbol-library-body">
          <div className="symbol-library-search">
            <Search size={14} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Søk etter symbol…"
              autoFocus
            />
          </div>
          <div className="symbol-library-kind-filter">
            {(['all', 'pipe', 'duct'] as const).map((k) => (
              <button
                key={k}
                className={`symbol-library-kind ${kindFilter === k ? 'active' : ''}`}
                onClick={() => {
                  setKindFilter(k);
                  // Ikke bli stående på en kategori som forsvinner under det nye filteret.
                  if (
                    activeGroup &&
                    activeGroup !== CUSTOM_GROUP &&
                    k !== 'all' &&
                    !LIBRARY_GROUPS.find((g) => g.label === activeGroup)?.types.some(
                      (t) => SYMBOL_DEFS[t].kind === k,
                    )
                  ) {
                    setActiveGroup(null);
                  }
                }}
              >
                {KIND_FILTER_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="symbol-library-layout">
            <div className="symbol-library-categories">
              <button
                className={`symbol-library-cat ${activeGroup === null ? 'active' : ''}`}
                onClick={() => setActiveGroup(null)}
              >
                Alle
              </button>
              {visibleGroups.map((g) => (
                <button
                  key={g.label}
                  className={`symbol-library-cat ${activeGroup === g.label ? 'active' : ''}`}
                  onClick={() => setActiveGroup(g.label)}
                >
                  {g.label}
                </button>
              ))}
              <button
                className={`symbol-library-cat ${activeGroup === CUSTOM_GROUP ? 'active' : ''}`}
                onClick={() => setActiveGroup(CUSTOM_GROUP)}
              >
                Mine komponenter
              </button>
            </div>
            <div className="symbol-library-grid-wrap">
              <div className="symbol-library-grid">
                {showBuiltins &&
                  filteredBuiltins.map((def) => {
                    const Icon = SYMBOL_ICONS[def.type];
                    const glyph = BUILTIN_SYMBOL_GLYPH[def.type as BuiltInSymbolType];
                    return (
                      <button
                        key={def.type}
                        className="symbol-library-card"
                        onClick={() => choose(def.type)}
                        title={def.label}
                      >
                        {Icon ? <Icon size={20} /> : glyph ? <GlyphPreview shape={glyph.shape} /> : null}
                        <span>{def.label}</span>
                      </button>
                    );
                  })}
                {(activeGroup === CUSTOM_GROUP || showCustom) &&
                  filteredCustom.map((c) => (
                    <div key={c.id} className="symbol-library-card custom">
                      <button className="symbol-library-card-main" onClick={() => choose(c.id)} title={c.label}>
                        <GlyphPreview shape={c.glyphShape} color={c.color} />
                        <span>{c.label}</span>
                      </button>
                      <button
                        className="symbol-library-card-remove"
                        onClick={() => removeCustomComponent(c.id)}
                        title="Slett komponent"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                {activeGroup === CUSTOM_GROUP && (
                  <button className="symbol-library-card new" onClick={() => setNewComponentOpen(true)}>
                    <Plus size={18} />
                    <span>Ny komponent</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {newComponentOpen && <CustomComponentDialog onClose={() => setNewComponentOpen(false)} />}
    </div>
  );
}
