import { useState } from 'react';
import type { ComponentType } from 'react';
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Eye,
  EyeOff,
  GitFork,
  Hand,
  LandPlot,
  MousePointer2,
  Plus,
  Ruler,
  Settings2,
  Tag as TagIcon,
  Trash2,
  Type,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  CavDamperIcon,
  CheckValveIcon,
  ControlValveIcon,
  DamperIcon,
  FanIcon,
  FireDamperIcon,
  MotorValveIcon,
  ShutoffValveIcon,
  ShuntValveIcon,
  SilencerIcon,
  VavDamperIcon,
} from './equipmentIcons';
import { useStore } from '../store';
import { CATEGORIES, SYMBOL_DEFS, SYMBOL_TYPE_ORDER, colorFor } from '../types';
import type { SubCategoryDef, SymbolType, ToolMode } from '../types';

const SYMBOL_ICONS: Record<string, LucideIcon | ComponentType<{ size?: number }>> = {
  tee: GitFork,
  shutoff_valve: ShutoffValveIcon,
  control_valve: ControlValveIcon,
  motor_valve: MotorValveIcon,
  check_valve: CheckValveIcon,
  shunt_valve: ShuntValveIcon,
  damper: DamperIcon,
  vav_damper: VavDamperIcon,
  cav_damper: CavDamperIcon,
  control_damper: DamperIcon,
  fire_damper: FireDamperIcon,
  silencer: SilencerIcon,
  supply_diffuser: ArrowUpFromLine,
  extract_diffuser: ArrowDownToLine,
  fan: FanIcon,
};

const VENT_SYMBOLS: SymbolType[] = SYMBOL_TYPE_ORDER.filter((t) => SYMBOL_DEFS[t].kind === 'duct');
const PIPE_SYMBOLS: SymbolType[] = SYMBOL_TYPE_ORDER.filter((t) => SYMBOL_DEFS[t].kind === 'pipe');

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const lineConfig = useStore((s) => s.lineConfig);
  const setLineSelection = useStore((s) => s.setLineSelection);
  const openScaleDialog = useStore((s) => s.openScaleDialog);
  const pdfDoc = useStore((s) => s.pdfDoc);
  const hiddenCategories = useStore((s) => s.hiddenCategories);
  const toggleCategoryVisibility = useStore((s) => s.toggleCategoryVisibility);
  const customDimensions = useStore((s) => s.customDimensions);
  const addCustomDimension = useStore((s) => s.addCustomDimension);
  const removeCustomDimension = useStore((s) => s.removeCustomDimension);
  const customColors = useStore((s) => s.customColors);
  const setCustomColor = useStore((s) => s.setCustomColor);
  const disabled = !pdfDoc;

  // Alle kategorier starter lukket – brukeren åpner kun det som faktisk skal tegnes,
  // i stedet for å møte alle underkategorier/utstyr utfoldet på én gang.
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CATEGORIES.map((c) => [c.code, true])),
  );
  const toggleCat = (code: string) => setCollapsedCats((c) => ({ ...c, [code]: !c[code] }));
  const [ventOpen, setVentOpen] = useState(false);
  const [pipeCompOpen, setPipeCompOpen] = useState(false);

  // Hvilken underkategori har en åpen velger, og om man er på materiale- eller dimensjonssteget
  const [openSubId, setOpenSubId] = useState<string | null>(null);
  const [pickingMaterial, setPickingMaterial] = useState<string | null>(null);

  function toggleSub(subId: string) {
    setOpenSubId((cur) => (cur === subId ? null : subId));
    setPickingMaterial(null);
  }

  function pickDimension(subId: string, material: string, dimension: string) {
    setLineSelection(subId, material, dimension);
    setOpenSubId(null);
    setPickingMaterial(null);
  }

  const ToolButton = ({
    mode,
    label,
    icon: Icon,
  }: {
    mode: ToolMode;
    label: string;
    icon: LucideIcon;
  }) => (
    <button
      className={`tool ${tool === mode ? 'active' : ''}`}
      onClick={() => setTool(mode)}
      disabled={disabled}
      title={label}
    >
      <span className="tool-icon">
        <Icon size={16} />
      </span>
      <span className="tool-label">{label}</span>
    </button>
  );

  return (
    <aside className="toolbar">
      <div className="tool-section">
        <span className="tool-heading">Navigasjon</span>
        <ToolButton mode="select" label="Velg" icon={MousePointer2} />
        <ToolButton mode="pan" label="Panorer" icon={Hand} />
      </div>

      <div className="tool-section">
        <span className="tool-heading">Rør &amp; kanaler</span>
        {CATEGORIES.map((cat) => {
          const isOpen = !collapsedCats[cat.code];
          const isHidden = hiddenCategories.has(cat.code);
          return (
            <div key={cat.code} className="cat-group">
              <div className="cat-header">
                <button
                  className="cat-header-toggle"
                  onClick={() => toggleCat(cat.code)}
                  disabled={disabled}
                  title={`${cat.code} ${cat.label}`}
                >
                  <span className={`cat-caret ${isOpen ? 'open' : ''}`}>
                    <ChevronRight size={13} />
                  </span>
                  <span className="cat-code">{cat.code}</span>
                  <span className="cat-label">{cat.label}</span>
                  <span className={`cat-kind ${cat.kind}`}>{cat.kind === 'duct' ? 'kanal' : 'rør'}</span>
                </button>
                <button
                  className={`cat-eye ${isHidden ? 'hidden-layer' : ''}`}
                  onClick={() => toggleCategoryVisibility(cat.code)}
                  disabled={disabled}
                  title={isHidden ? 'Vis på lerretet' : 'Skjul fra lerretet'}
                >
                  {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <div className={`collapse ${isOpen ? 'open' : ''}`}>
                <div className="cat-subs">
                  {cat.subs.map((sub) => (
                    <SubPicker
                      key={sub.id}
                      sub={sub}
                      dashed={cat.kind === 'duct'}
                      disabled={disabled}
                      isActiveTool={tool === `line:${sub.id}`}
                      config={lineConfig[sub.id]}
                      isOpen={openSubId === sub.id}
                      pickingMaterial={openSubId === sub.id ? pickingMaterial : null}
                      onToggle={() => toggleSub(sub.id)}
                      onPickMaterial={setPickingMaterial}
                      onPickDimension={(material, dimension) =>
                        pickDimension(sub.id, material, dimension)
                      }
                      customDimensions={customDimensions[sub.id] ?? []}
                      onAddCustomDimension={(dimension) => addCustomDimension(sub.id, dimension)}
                      onRemoveCustomDimension={(dimension) => removeCustomDimension(sub.id, dimension)}
                      color={colorFor(sub, customColors)}
                      onSetColor={(color) => setCustomColor(sub.id, color)}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="tool-section">
        <button className="cat-header-toggle" onClick={() => setVentOpen((o) => !o)} disabled={disabled}>
          <span className={`cat-caret ${ventOpen ? 'open' : ''}`}>
            <ChevronRight size={13} />
          </span>
          <Wrench size={13} className="cat-icon" />
          <span className="cat-label">Komponenter – Ventilasjon</span>
        </button>
        <div className={`collapse ${ventOpen ? 'open' : ''}`}>
          <div className="tool-grid">
            {VENT_SYMBOLS.map((t) => {
              const Icon = SYMBOL_ICONS[t];
              const label = SYMBOL_DEFS[t].label;
              return (
                <button
                  key={t}
                  className={`tool-grid-item ${tool === `symbol:${t}` ? 'active' : ''}`}
                  onClick={() => setTool(`symbol:${t}`)}
                  disabled={disabled}
                  title={label}
                >
                  <Icon size={17} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="tool-section">
        <button className="cat-header-toggle" onClick={() => setPipeCompOpen((o) => !o)} disabled={disabled}>
          <span className={`cat-caret ${pipeCompOpen ? 'open' : ''}`}>
            <ChevronRight size={13} />
          </span>
          <Wrench size={13} className="cat-icon" />
          <span className="cat-label">Komponenter – Rør</span>
        </button>
        <div className={`collapse ${pipeCompOpen ? 'open' : ''}`}>
          <div className="tool-grid">
            {PIPE_SYMBOLS.map((t) => {
              const Icon = SYMBOL_ICONS[t];
              const label = SYMBOL_DEFS[t].label;
              return (
                <button
                  key={t}
                  className={`tool-grid-item ${tool === `symbol:${t}` ? 'active' : ''}`}
                  onClick={() => setTool(`symbol:${t}`)}
                  disabled={disabled}
                  title={label}
                >
                  <Icon size={17} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="tool-section">
        <span className="tool-heading">Tekst &amp; skyer</span>
        <ToolButton mode="annotation:text" label="Tekst" icon={Type} />
        <ToolButton mode="annotation:cloud" label="Sky" icon={Cloud} />
      </div>

      <div className="tool-section">
        <span className="tool-heading">Verktøy</span>
        <ToolButton mode="tag" label="Tag" icon={TagIcon} />
        <ToolButton mode="measure:distance" label="Avstand" icon={ArrowRightLeft} />
        <ToolButton mode="measure:area" label="Areal" icon={LandPlot} />
      </div>

      <div className="tool-section">
        <span className="tool-heading">Målestokk</span>
        <button
          className={`tool ${tool === 'calibrate' ? 'active' : ''}`}
          onClick={() => setTool('calibrate')}
          disabled={disabled}
          title="Kalibrer ved å klikke to punkter"
        >
          <span className="tool-icon">
            <Ruler size={16} />
          </span>
          <span className="tool-label">Kalibrer</span>
        </button>
        <button className="tool" onClick={() => openScaleDialog('manual')} disabled={disabled}>
          <span className="tool-icon">
            <Settings2 size={16} />
          </span>
          <span className="tool-label">Sett målestokk</span>
        </button>
      </div>
    </aside>
  );
}

// ── Kaskaderende velger: underkategori → materiale → dimensjon ────────────

interface SubPickerProps {
  sub: SubCategoryDef;
  dashed: boolean;
  disabled: boolean;
  isActiveTool: boolean;
  config: { material: string; dimension: string } | undefined;
  isOpen: boolean;
  pickingMaterial: string | null;
  onToggle: () => void;
  onPickMaterial: (material: string | null) => void;
  onPickDimension: (material: string, dimension: string) => void;
  customDimensions: string[];
  onAddCustomDimension: (dimension: string) => void;
  onRemoveCustomDimension: (dimension: string) => void;
  color: string;
  onSetColor: (color: string) => void;
}

function SubPicker({
  sub,
  dashed,
  disabled,
  isActiveTool,
  config,
  isOpen,
  pickingMaterial,
  onToggle,
  onPickMaterial,
  onPickDimension,
  customDimensions,
  onAddCustomDimension,
  onRemoveCustomDimension,
  color,
  onSetColor,
}: SubPickerProps) {
  const [newDimension, setNewDimension] = useState('');

  function submitNewDimension() {
    if (!newDimension.trim()) return;
    onAddCustomDimension(newDimension);
    setNewDimension('');
  }

  return (
    <div className="sub-picker">
      <button
        className={`tool sub-trigger ${isActiveTool ? 'active' : ''}`}
        onClick={onToggle}
        disabled={disabled}
        title={sub.label}
      >
        <label
          className="tool-swatch-picker"
          onClick={(e) => e.stopPropagation()}
          title="Endre farge for denne underkategorien"
        >
          <span
            className="tool-swatch"
            style={{
              background: dashed ? 'transparent' : color,
              borderColor: color,
              borderStyle: dashed ? 'dashed' : 'solid',
            }}
          />
          <input
            type="color"
            className="tool-swatch-input"
            value={color}
            onChange={(e) => onSetColor(e.target.value)}
          />
        </label>
        <span className="tool-label-stack">
          <span className="tool-label">{sub.label}</span>
          {isActiveTool && config && (
            <span className="tool-config">{config.material} · {config.dimension}</span>
          )}
        </span>
        <span className={`sub-caret ${isOpen ? 'open' : ''}`}>
          <ChevronDown size={13} />
        </span>
      </button>

      <div className={`collapse ${isOpen ? 'open' : ''}`}>
        <div className="sub-flyout">
          {pickingMaterial == null ? (
            <>
              <div className="flyout-heading">Velg rørtype</div>
              {sub.materials.map((m) => (
                <button key={m} className="flyout-item" onClick={() => onPickMaterial(m)}>
                  {m}
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="flyout-heading">
                <button
                  className="flyout-back"
                  onClick={() => onPickMaterial(null)}
                  title="Tilbake til rørtyper"
                >
                  <ChevronLeft size={13} />
                </button>
                {pickingMaterial} – velg dimensjon
              </div>
              <div className="flyout-grid">
                {sub.dimensions.map((d) => (
                  <button
                    key={d}
                    className="flyout-chip"
                    onClick={() => onPickDimension(pickingMaterial, d)}
                  >
                    {d}
                  </button>
                ))}
                {customDimensions.map((d) => (
                  <button
                    key={d}
                    className="flyout-chip custom"
                    onClick={() => onPickDimension(pickingMaterial, d)}
                  >
                    {d}
                    <span
                      className="flyout-chip-remove"
                      title="Fjern egendefinert dimensjon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveCustomDimension(d);
                      }}
                    >
                      <Trash2 size={11} />
                    </span>
                  </button>
                ))}
              </div>
              <div className="flyout-custom-dim">
                <input
                  type="text"
                  value={newDimension}
                  onChange={(e) => setNewDimension(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') submitNewDimension();
                  }}
                  placeholder="f.eks. Ø355 eller 250x150"
                  title="Legg til en egendefinert dimensjon for denne underkategorien"
                />
                <button className="btn icon" onClick={submitNewDimension} title="Legg til dimensjon">
                  <Plus size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
