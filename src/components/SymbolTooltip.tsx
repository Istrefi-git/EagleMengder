import { SYMBOL_DEFS } from '../types';
import type { SymbolEntity } from '../types';

interface Props {
  symbol: SymbolEntity;
  screenX: number;
  screenY: number;
}

/** Viser alle konfigurerte egenskaper for et utstyrssymbol når musen holdes over det. */
export function SymbolTooltip({ symbol, screenX, screenY }: Props) {
  const def = SYMBOL_DEFS[symbol.type];
  return (
    <div className="symbol-tooltip" style={{ left: screenX, top: screenY }}>
      <strong>{def.label}</strong>
      {def.fields.length === 0 && <span className="muted">Ingen egenskaper</span>}
      {def.fields.map((f) => (
        <div key={f.key} className="symbol-tooltip-row">
          <span>{f.label}</span>
          <span>
            {symbol.props[f.key]}
            {f.unit ? ` ${f.unit}` : ''}
          </span>
        </div>
      ))}
      <div className="symbol-tooltip-row">
        <span>Rotasjon</span>
        <span>{symbol.rotation}°</span>
      </div>
    </div>
  );
}
