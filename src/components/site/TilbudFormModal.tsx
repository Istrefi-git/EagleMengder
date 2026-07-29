import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  onSave: (name: string) => void;
  onClose: () => void;
  /** Overstyrer tittel/knappetekst – brukt til å gjenbruke modalen for «Kopier
   * tegning» (nytt tilbud på samme PDF), i tillegg til vanlig «Nytt tilbud». */
  title?: string;
  submitLabel?: string;
  initialName?: string;
}

export function TilbudFormModal({ onSave, onClose, title, submitLabel, initialName }: Props) {
  const [name, setName] = useState(initialName ?? '');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
  }

  return (
    <div className="site-modal-backdrop" onMouseDown={onClose}>
      <div className="site-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="site-modal-head">
          <h2>{title ?? 'Nytt tilbud'}</h2>
          <button className="site-modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <form className="site-form" onSubmit={submit}>
          <label className="site-field">
            <span className="site-label">Navn på tilbud</span>
            <input
              className="site-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="f.eks. Sanitær, Varmeanlegg, Ventilasjon"
              autoFocus
              required
            />
          </label>
          <button className="site-btn primary full" type="submit">
            {submitLabel ?? 'Opprett tilbud'}
          </button>
        </form>
      </div>
    </div>
  );
}
