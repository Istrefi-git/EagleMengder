import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { useStore } from '../store';
import { CLAMP_ROD_DIAMETERS, DUCT_LENGTH_OPTIONS_MM, PIPE_LENGTH_OPTIONS_MM } from '../types';

export function SettingsDialog() {
  const open = useStore((s) => s.settingsDialogOpen);
  const standardLengths = useStore((s) => s.standardLengths);
  const setStandardLength = useStore((s) => s.setStandardLength);
  const showAirflowArrows = useStore((s) => s.showAirflowArrows);
  const setShowAirflowArrows = useStore((s) => s.setShowAirflowArrows);
  const hideComponentLabels = useStore((s) => s.hideComponentLabels);
  const setHideComponentLabels = useStore((s) => s.setHideComponentLabels);
  const autoInsertClamps = useStore((s) => s.autoInsertClamps);
  const setAutoInsertClamps = useStore((s) => s.setAutoInsertClamps);
  const clampSpacing = useStore((s) => s.clampSpacing);
  const setClampSpacing = useStore((s) => s.setClampSpacing);
  const clampRodDiameter = useStore((s) => s.clampRodDiameter);
  const setClampRodDiameter = useStore((s) => s.setClampRodDiameter);
  const clampRodLengthMm = useStore((s) => s.clampRodLengthMm);
  const setClampRodLengthMm = useStore((s) => s.setClampRodLengthMm);
  const customSystems = useStore((s) => s.customSystems);
  const addCustomSystem = useStore((s) => s.addCustomSystem);
  const removeCustomSystem = useStore((s) => s.removeCustomSystem);
  const close = useStore((s) => s.closeSettingsDialog);

  const [newSystem, setNewSystem] = useState('');

  if (!open) return null;

  function submitNewSystem() {
    if (!newSystem.trim()) return;
    addCustomSystem(newSystem);
    setNewSystem('');
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Innstillinger</h2>
          <button className="btn icon" onClick={close}>
            <X size={15} />
          </button>
        </div>

        <div className="modal-body">
          <div className="tab-pane">
            <p className="note">
              Standard leveringslengde brukes til å beregne antall nippel/muffe som
              automatisk legges til i mengdelisten når et tegnet rør/kanal er lengre
              enn standardlengden.
            </p>

            <div className="field">
              <span>Kanal (Nippel)</span>
              <div className="radio-row">
                {DUCT_LENGTH_OPTIONS_MM.map((mm) => (
                  <label key={mm} className={`radio-chip ${standardLengths.duct === mm ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="duct-length"
                      checked={standardLengths.duct === mm}
                      onChange={() => setStandardLength('duct', mm)}
                    />
                    {mm} mm
                  </label>
                ))}
              </div>
            </div>

            <div className="field">
              <span>Rør (Muffe)</span>
              <div className="radio-row">
                {PIPE_LENGTH_OPTIONS_MM.map((mm) => (
                  <label key={mm} className={`radio-chip ${standardLengths.pipe === mm ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="pipe-length"
                      checked={standardLengths.pipe === mm}
                      onChange={() => setStandardLength('pipe', mm)}
                    />
                    {mm} mm
                  </label>
                ))}
              </div>
            </div>

            <label className="field row">
              <input
                type="checkbox"
                checked={showAirflowArrows}
                onChange={(e) => setShowAirflowArrows(e.target.checked)}
              />
              <span>Vis luftretningspiler på tilluft-/avtrekksventiler</span>
            </label>

            <label className="field row">
              <input
                type="checkbox"
                checked={hideComponentLabels}
                onChange={(e) => setHideComponentLabels(e.target.checked)}
              />
              <span>Skjul komponenttekst (overganger, avgreininger)</span>
            </label>

            <label className="field row">
              <input
                type="checkbox"
                checked={autoInsertClamps}
                onChange={(e) => setAutoInsertClamps(e.target.checked)}
              />
              <span>Legg til klammer og gjengestag automatisk på nye kanaler/rør</span>
            </label>
            <p className="note">
              Klammer kan også settes inn manuelt ved å høyreklikke på et tegnet
              rør/kanal. Standard gjengestag-diameter og -lengde under brukes for
              alle nye klammer, både automatiske og manuelt plasserte.
            </p>
            <div className="field">
              <span>Standard gjengestag – diameter</span>
              <select
                value={clampRodDiameter}
                onChange={(e) => setClampRodDiameter(Number(e.target.value))}
              >
                {CLAMP_ROD_DIAMETERS.map((d) => (
                  <option key={d} value={d}>
                    Ø{d} mm
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span>Standard gjengestag – lengde</span>
              <input
                type="number"
                min={50}
                step={10}
                value={clampRodLengthMm}
                onChange={(e) => setClampRodLengthMm(Number(e.target.value))}
              />
            </div>
            {autoInsertClamps && (
              <>
                <div className="field">
                  <span>Klammeravstand – kanal</span>
                  <input
                    type="number"
                    min={100}
                    step={100}
                    value={clampSpacing.duct}
                    onChange={(e) => setClampSpacing('duct', Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <span>Klammeravstand – rør</span>
                  <input
                    type="number"
                    min={100}
                    step={100}
                    value={clampSpacing.pipe}
                    onChange={(e) => setClampSpacing('pipe', Number(e.target.value))}
                  />
                </div>
              </>
            )}

            <div className="field">
              <span>Systemer</span>
              <p className="note">
                Definer egne systemkoder (f.eks. «360.001») som kan velges når du tegner
                et rør/kanal eller plasserer utstyr.
              </p>
              <div className="field row">
                <input
                  type="text"
                  value={newSystem}
                  onChange={(e) => setNewSystem(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitNewSystem()}
                  placeholder="f.eks. 360.001"
                />
                <button className="btn" onClick={submitNewSystem}>
                  Legg til
                </button>
              </div>
              {customSystems.length > 0 && (
                <div className="system-list">
                  {customSystems.map((code) => (
                    <div key={code} className="system-list-item">
                      <span>{code}</span>
                      <button
                        className="btn icon"
                        onClick={() => removeCustomSystem(code)}
                        title="Fjern system"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
