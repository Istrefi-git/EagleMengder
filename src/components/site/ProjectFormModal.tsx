import { useState } from 'react';
import { X } from 'lucide-react';
import type { Project } from '../../lib/projectsStore';

export interface ProjectFormValues {
  name: string;
  customer: string;
  projectNumber: string;
  address: string;
  description: string;
}

interface Props {
  initial?: Project | null;
  onSave: (values: ProjectFormValues) => void;
  onClose: () => void;
}

export function ProjectFormModal({ initial, onSave, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [customer, setCustomer] = useState(initial?.customer ?? '');
  const [projectNumber, setProjectNumber] = useState(initial?.projectNumber ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), customer, projectNumber, address, description });
  }

  return (
    <div className="site-modal-backdrop" onMouseDown={onClose}>
      <div className="site-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="site-modal-head">
          <h2>{initial ? 'Rediger prosjekt' : 'Nytt prosjekt'}</h2>
          <button className="site-modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <form className="site-form" onSubmit={submit}>
          <label className="site-field">
            <span className="site-label">Prosjektnavn</span>
            <input
              className="site-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Livsvitenskapsbygget"
              autoFocus
              required
            />
          </label>
          <label className="site-field">
            <span className="site-label">Kunde</span>
            <input
              className="site-input"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="PHARMAQ"
            />
          </label>
          <label className="site-field">
            <span className="site-label">Prosjektnummer</span>
            <input
              className="site-input"
              value={projectNumber}
              onChange={(e) => setProjectNumber(e.target.value)}
              placeholder="52501526"
            />
          </label>
          <label className="site-field">
            <span className="site-label">Adresse</span>
            <input
              className="site-input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Industrivegen 50, 7863 Overhalla"
            />
          </label>
          <label className="site-field">
            <span className="site-label">Beskrivelse</span>
            <textarea
              className="site-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kort beskrivelse av prosjektet"
            />
          </label>
          <button className="site-btn primary full" type="submit">
            {initial ? 'Lagre endringer' : 'Opprett prosjekt'}
          </button>
        </form>
      </div>
    </div>
  );
}
