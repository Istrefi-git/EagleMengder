import { useState } from 'react';
import type { ComponentType } from 'react';
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  Box,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Cloud,
  Copy,
  Eye,
  EyeOff,
  GitFork,
  Hand,
  Highlighter,
  LandPlot,
  LibraryBig,
  Minus,
  MessageSquareText,
  MousePointer2,
  Move,
  MoveUpRight,
  Pentagon,
  Plus,
  Ruler,
  Scissors,
  Settings2,
  Square,
  Tag as TagIcon,
  TextCursorInput,
  Trash2,
  Type,
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
import {
  CATEGORIES,
  colorFor,
  dimensionsForMaterial,
  isDuctSub,
  isRectDim,
  RECT_DUCT_MATERIAL,
  SUBCATEGORIES,
} from '../types';
import type { SubCategoryDef, ToolMode } from '../types';
import { SymbolLibraryDialog } from './SymbolLibraryDialog';

export const SYMBOL_ICONS: Record<string, LucideIcon | ComponentType<{ size?: number }>> = {
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
  air_handling_unit: Box,
};

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const lineConfig = useStore((s) => s.lineConfig);
  const recentLineTypes = useStore((s) => s.recentLineTypes);
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

  // Kategoriene starter ÅPNE. Å måtte folde ut før man i det hele tatt ser
  // underkategoriene var det første av fire klikk før man fikk tegnet noe.
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const toggleCat = (code: string) => setCollapsedCats((c) => ({ ...c, [code]: !c[code] }));
  const [libraryOpen, setLibraryOpen] = useState(false);
  // «Tekst & skyer» og «Verktøy» kan minimeres på samme måte som komponentseksjonene –
  // starter åpne siden markup-/måleverktøyene brukes ofte.
  const [textOpen, setTextOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(true);

  // Hvilken underkategori har en åpen velger, og om man er på materiale- eller dimensjonssteget
  const [openSubId, setOpenSubId] = useState<string | null>(null);
  const [pickingMaterial, setPickingMaterial] = useState<string | null>(null);

  function toggleSub(subId: string) {
    setOpenSubId((cur) => (cur === subId ? null : subId));
    setPickingMaterial(null);
  }

  /** Ett klikk på en underkategori armerer verktøyet direkte, med sist brukte
   *  valg for nettopp den underkategorien – ellers sist brukte type generelt,
   *  ellers katalogens standard. Flyouten er finjustering, ikke en tvungen sti. */
  function activateSub(sub: SubCategoryDef) {
    const cfg =
      lineConfig[sub.id] ??
      recentLineTypes.find((r) => r.subId === sub.id) ??
      (() => {
        const material = sub.materials[0];
        // Send ekte customDimensions – en bruker som kun har egendefinerte mål
        // ville ellers fått en dimensjon som ikke finnes i lista.
        const dims = dimensionsForMaterial(sub, material, customDimensions);
        return { material, dimension: dims[0] ?? sub.dimensions[0] };
      })();
    setLineSelection(sub.id, cfg.material, cfg.dimension);
    setOpenSubId(null);
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
    title,
  }: {
    mode: ToolMode;
    label: string;
    icon: LucideIcon;
    title?: string;
  }) => (
    <button
      className={`tool ${tool === mode ? 'active' : ''}`}
      onClick={() => setTool(mode)}
      disabled={disabled}
      title={title ?? label}
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
        <ToolButton mode="select" label="Velg" icon={MousePointer2} title="Velg (V)" />
        <ToolButton mode="pan" label="Panorer" icon={Hand} />
      </div>

      <div className="tool-section">
        <span className="tool-heading">Rediger</span>
        <ToolButton
          mode="move"
          label="Flytt"
          icon={Move}
          title="Flytt (F) – velg objekter, klikk et basispunkt, klikk der de skal havne. Shift låser vinkel, skriv et tall = eksakt avstand i mm."
        />
        <ToolButton
          mode="copy"
          label="Kopier"
          icon={Copy}
          title="Kopier (C) – velg objekter, klikk et basispunkt, klikk der kopien skal havne. Shift låser vinkel, skriv et tall = eksakt avstand i mm."
        />
        <ToolButton
          mode="split"
          label="Del"
          icon={Scissors}
          title="Del (D) – klikk på et tegnet rør/kanal for å dele det i to der du klikker."
        />
      </div>

      {recentLineTypes.length > 0 && (
        <div className="tool-section recent-types">
          <span className="tool-heading">Sist brukt</span>
          <div className="recent-chips">
            {recentLineTypes.map((r) => {
              const sub = SUBCATEGORIES[r.subId];
              if (!sub) return null; // underkategorien kan være fjernet siden sist
              const active =
                tool === `line:${r.subId}` &&
                lineConfig[r.subId]?.material === r.material &&
                lineConfig[r.subId]?.dimension === r.dimension;
              return (
                <button
                  key={`${r.subId}|${r.material}|${r.dimension}`}
                  className={`recent-chip ${active ? 'active' : ''}`}
                  onClick={() => setLineSelection(r.subId, r.material, r.dimension)}
                  disabled={disabled}
                  title={`${sub.label} · ${r.material} · ${r.dimension}`}
                >
                  <span className="recent-dot" style={{ background: colorFor(sub, customColors) }} />
                  {sub.label} <em>{r.dimension}</em>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="tool-section">
        <span className="tool-heading" title="Hurtigtast R (rør) / K (kanal) armerer sist brukte type">
          Rør &amp; kanaler
        </span>
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
                      onActivate={() => activateSub(sub)}
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
        <span className="tool-heading">Komponenter</span>
        <button
          className={`tool ${tool.startsWith('symbol:') ? 'active' : ''}`}
          onClick={() => setLibraryOpen(true)}
          disabled={disabled}
          title="Åpne symbolbiblioteket – ventiler, spjeld, diffusorer og dine egne komponenter"
        >
          <span className="tool-icon">
            <LibraryBig size={16} />
          </span>
          <span className="tool-label">Bibliotek…</span>
        </button>
      </div>

      <div className="tool-section">
        <button className="cat-header-toggle" onClick={() => setTextOpen((o) => !o)} disabled={disabled}>
          <span className={`cat-caret ${textOpen ? 'open' : ''}`}>
            <ChevronRight size={13} />
          </span>
          <Type size={13} className="cat-icon" />
          <span className="cat-label">Tekst &amp; skyer</span>
        </button>
        <div className={`collapse ${textOpen ? 'open' : ''}`}>
          <ToolButton mode="annotation:text" label="Tekst" icon={Type} />
          <ToolButton mode="annotation:textbox" label="Tekstboks" icon={TextCursorInput} />
          <ToolButton mode="annotation:callout" label="Melding" icon={MessageSquareText} />
          <ToolButton mode="annotation:cloud" label="Sky" icon={Cloud} />
        </div>
      </div>

      <div className="tool-section">
        <button className="cat-header-toggle" onClick={() => setToolsOpen((o) => !o)} disabled={disabled}>
          <span className={`cat-caret ${toolsOpen ? 'open' : ''}`}>
            <ChevronRight size={13} />
          </span>
          <Ruler size={13} className="cat-icon" />
          <span className="cat-label">Verktøy</span>
        </button>
        <div className={`collapse ${toolsOpen ? 'open' : ''}`}>
          <ToolButton mode="tag" label="Tag" icon={TagIcon} />
          <ToolButton mode="measure:distance" label="Avstand" icon={ArrowRightLeft} title="Avstand (A)" />
          <ToolButton mode="measure:area" label="Areal" icon={LandPlot} />
          <ToolButton mode="annotation:line" label="Linje" icon={Minus} />
          <ToolButton mode="annotation:arrow" label="Pil" icon={MoveUpRight} />
          <ToolButton mode="annotation:ellipse" label="Ellipse" icon={Circle} />
          <ToolButton mode="annotation:rect" label="Rektangel" icon={Square} />
          <ToolButton mode="annotation:polygon" label="Polygon" icon={Pentagon} />
          <ToolButton mode="annotation:highlight" label="Marker" icon={Highlighter} />
        </div>
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
      {libraryOpen && <SymbolLibraryDialog onClose={() => setLibraryOpen(false)} />}
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
  /** Ett klikk på selve raden – armerer verktøyet direkte. */
  onActivate: () => void;
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
  onActivate,
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
      <div className={`sub-trigger-row ${isActiveTool ? 'active' : ''}`}>
        <button
          className={`tool sub-trigger ${isActiveTool ? 'active' : ''}`}
          onClick={onActivate}
          disabled={disabled}
          title={`${sub.label} – klikk for å tegne med sist brukte verdier`}
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
            {/* Vises for ALLE underkategorier, ikke bare den aktive – det er
                dette som gjør ett-klikks-aktivering trygt: man ser hva man
                får før man klikker. */}
            {config && (
              <span className="tool-config">{config.material} · {config.dimension}</span>
            )}
          </span>
        </button>
        <button
          className={`sub-caret-btn ${isOpen ? 'open' : ''}`}
          onClick={onToggle}
          disabled={disabled}
          title="Velg materiale og dimensjon manuelt"
        >
          <ChevronDown size={13} />
        </button>
      </div>

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
                {dimensionsForMaterial(sub, pickingMaterial, {}).map((d) => (
                  <button
                    key={d}
                    className="flyout-chip"
                    onClick={() => onPickDimension(pickingMaterial, d)}
                  >
                    {d}
                  </button>
                ))}
                {(isDuctSub(sub.id)
                  ? customDimensions.filter((d) => isRectDim(d) === (pickingMaterial === RECT_DUCT_MATERIAL))
                  : customDimensions
                ).map((d) => (
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
