import { useEffect, useState } from 'react';
import { Info, Ruler, ScanSearch, X } from 'lucide-react';
import { useStore } from '../store';
import { calibratedScale, manualScale } from '../lib/scale';

export function ScaleDialog() {
  const open = useStore((s) => s.scaleDialogOpen);
  const tab = useStore((s) => s.scaleDialogTab);
  const calibPx = useStore((s) => s.calibrationDistancePx);
  const autoResult = useStore((s) => s.autoDetected);
  const isScanning = useStore((s) => s.isScanning);
  const rescanAutoScale = useStore((s) => s.rescanAutoScale);
  const setScale = useStore((s) => s.setScale);
  const close = useStore((s) => s.closeScaleDialog);
  const setTool = useStore((s) => s.setTool);

  const [activeTab, setActiveTab] = useState(tab);
  const [denominator, setDenominator] = useState('100');
  const [realMm, setRealMm] = useState('1000');

  // Synk fane når dialog åpnes (f.eks. kalibrering trigget fra canvas)
  useEffect(() => {
    if (open) setActiveTab(tab);
  }, [open, tab]);

  if (!open) return null;

  function applyManual() {
    const d = parseInt(denominator, 10);
    if (!Number.isFinite(d) || d <= 0) return;
    setScale(manualScale(d));
    close();
  }

  function applyCalibration() {
    const mm = parseFloat(realMm.replace(',', '.'));
    if (!calibPx || !Number.isFinite(mm) || mm <= 0) return;
    setScale(calibratedScale(calibPx, mm));
    close();
  }

  function applyAuto() {
    if (autoResult) {
      setScale(autoResult);
      close();
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Målestokk</h2>
          <button className="btn icon" onClick={close}>
            <X size={15} />
          </button>
        </div>

        <div className="tabs">
          <button className={activeTab === 'auto' ? 'tab active' : 'tab'} onClick={() => setActiveTab('auto')}>
            Automatisk
          </button>
          <button className={activeTab === 'manual' ? 'tab active' : 'tab'} onClick={() => setActiveTab('manual')}>
            Manuell
          </button>
          <button className={activeTab === 'calibrate' ? 'tab active' : 'tab'} onClick={() => setActiveTab('calibrate')}>
            Kalibrer
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'auto' && (
            <div className="tab-pane">
              <p className="note">
                <Info size={14} className="note-icon" />
                Søker gjennom tekstinnholdet i PDF-en etter et målestokk-mønster
                (f.eks. «MÅLESTOKK 1:50»). Fungerer kun hvis PDF-en har innebygd/søkbar
                tekst – ikke en ren skannet rastertegning.
              </p>
              {isScanning ? (
                <div className="auto-result">
                  <div className="auto-big muted">Skanner…</div>
                </div>
              ) : autoResult ? (
                <div className="auto-result">
                  <div className="auto-big">{autoResult.label}</div>
                  <p className="muted">Funnet i tegningens tekstinnhold.</p>
                  <button className="btn primary full" onClick={applyAuto}>
                    Bruk denne målestokken
                  </button>
                </div>
              ) : (
                <div className="auto-result">
                  <div className="auto-big muted">Ingen målestokk funnet</div>
                  <p className="muted">
                    Fant ikke et 1:xx-mønster i PDF-teksten. Bruk Manuell eller Kalibrer.
                  </p>
                </div>
              )}
              <button className="btn full" onClick={() => rescanAutoScale()} disabled={isScanning}>
                <ScanSearch size={15} />
                {isScanning ? 'Skanner…' : 'Skann PDF-en på nytt'}
              </button>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="tab-pane">
              <p className="note">Skriv inn målestokken fra tegningen, f.eks. 100 for 1:100.</p>
              <label className="field row">
                <span>1 :</span>
                <input
                  type="number"
                  min={1}
                  value={denominator}
                  onChange={(e) => setDenominator(e.target.value)}
                  autoFocus
                />
              </label>
              <button className="btn primary full" onClick={applyManual}>
                Bruk 1:{denominator || '?'}
              </button>
            </div>
          )}

          {activeTab === 'calibrate' && (
            <div className="tab-pane">
              {calibPx == null ? (
                <>
                  <p className="note">
                    Klikk to punkter på tegningen med kjent avstand. Lukk denne dialogen,
                    velg <strong>Kalibrer</strong>-verktøyet og klikk de to punktene.
                  </p>
                  <button
                    className="btn primary full"
                    onClick={() => {
                      setTool('calibrate');
                      close();
                    }}
                  >
                    <Ruler size={15} />
                    Start kalibrering
                  </button>
                </>
              ) : (
                <>
                  <p className="note">
                    Du målte en avstand på <strong>{Math.round(calibPx)} px</strong>. Hva er den
                    faktiske avstanden?
                  </p>
                  <label className="field row">
                    <span>Avstand</span>
                    <input
                      type="number"
                      min={1}
                      value={realMm}
                      onChange={(e) => setRealMm(e.target.value)}
                      autoFocus
                    />
                    <span>mm</span>
                  </label>
                  <button className="btn primary full" onClick={applyCalibration}>
                    Bruk kalibrering
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
