import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, ClipboardList, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { SiteNav } from '../components/site/SiteNav';
import { ProjectFormModal, type ProjectFormValues } from '../components/site/ProjectFormModal';
import { TilbudFormModal } from '../components/site/TilbudFormModal';
import { useCurrentUser } from '../lib/authStore';
import { useProjectsStore, type Tilbud } from '../lib/projectsStore';
import { copyPdfBytes, deletePdfBytes } from '../lib/pdfStorage';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const user = useCurrentUser();

  const project = useProjectsStore((s) => s.projects.find((p) => p.id === projectId));
  const tilbudList = useProjectsStore((s) => s.tilbud.filter((t) => t.projectId === projectId));
  const updateProject = useProjectsStore((s) => s.updateProject);
  const addTilbud = useProjectsStore((s) => s.addTilbud);
  const duplicateTilbudDrawing = useProjectsStore((s) => s.duplicateTilbudDrawing);
  const deleteTilbud = useProjectsStore((s) => s.deleteTilbud);

  const [editOpen, setEditOpen] = useState(false);
  const [newTilbudOpen, setNewTilbudOpen] = useState(false);
  const [copySource, setCopySource] = useState<Tilbud | null>(null);

  if (!project || project.ownerId !== user?.id) {
    return <Navigate to="/dashboard" replace />;
  }
  const proj = project;

  function onSaveProject(values: ProjectFormValues) {
    updateProject(proj.id, values);
    setEditOpen(false);
  }

  function onCreateTilbud(name: string) {
    const t = addTilbud(proj.id, name);
    setNewTilbudOpen(false);
    navigate(`/projects/${proj.id}/tilbud/${t.id}`);
  }

  async function onCopyDrawing(name: string) {
    if (!copySource) return;
    const t = duplicateTilbudDrawing(copySource.id, name);
    setCopySource(null);
    if (!t) return;
    await copyPdfBytes(copySource.id, t.id);
    navigate(`/projects/${proj.id}/tilbud/${t.id}`);
  }

  function onDeleteTilbud(id: string, name: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (window.confirm(`Slette tilbudet «${name}»? Mengdedata og opplastet tegning forsvinner.`)) {
      deleteTilbud(id);
      void deletePdfBytes(id);
    }
  }

  return (
    <div className="site">
      <SiteNav />
      <div className="site-page">
        <div className="site-page-body">
          <div className="site-page-header">
            <div>
              <p className="site-breadcrumb">
                <Link to="/dashboard">Prosjekter</Link>
                <ChevronRight size={13} />
                <span>{project.name}</span>
              </p>
              <h1 className="site-page-title">{project.name}</h1>
              <p className="site-page-sub">
                {[project.customer, project.projectNumber, project.address].filter(Boolean).join(' · ') ||
                  'Ingen prosjektdetaljer lagt til.'}
              </p>
            </div>
            <button className="site-btn ghost" onClick={() => setEditOpen(true)}>
              <Pencil size={15} />
              Rediger prosjekt
            </button>
          </div>

          <div className="site-page-header" style={{ marginTop: -8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 650 }}>Tilbud</h2>
            <button className="site-btn primary sm" onClick={() => setNewTilbudOpen(true)}>
              <Plus size={15} />
              Nytt tilbud
            </button>
          </div>

          {tilbudList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <ClipboardList size={22} />
              </div>
              <h3>Ingen tilbud i dette prosjektet</h3>
              <p>Opprett et tilbud, f.eks. «Sanitær» eller «Ventilasjon», for å starte mengdeuttak.</p>
              <button className="site-btn primary" onClick={() => setNewTilbudOpen(true)}>
                <Plus size={15} />
                Nytt tilbud
              </button>
            </div>
          ) : (
            <div className="tilbud-list">
              {tilbudList.map((t) => {
                const lineCount = t.snapshot?.lines.length ?? 0;
                const symbolCount = t.snapshot?.symbols.length ?? 0;
                const hasDrawing = !!t.snapshot?.fileName;
                return (
                  <div
                    className="tilbud-row"
                    key={t.id}
                    onClick={() => navigate(`/projects/${project.id}/tilbud/${t.id}`)}
                  >
                    <span className="tilbud-row-icon">
                      <ClipboardList size={17} />
                    </span>
                    <div className="tilbud-row-body">
                      <div className="tilbud-row-name">{t.name}</div>
                      <div className="tilbud-row-meta">
                        {lineCount > 0 || symbolCount > 0
                          ? `${lineCount} linjer · ${symbolCount} komponenter`
                          : 'Ingen mengdedata ennå'}{' '}
                        · {hasDrawing ? 'Har tegning' : 'Ingen tegning'} · Opprettet {formatDate(t.createdAt)}
                      </div>
                    </div>
                    <div className="tilbud-row-actions">
                      {hasDrawing && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCopySource(t);
                          }}
                          title="Nytt tilbud på samme tegning"
                        >
                          <Copy size={15} />
                        </button>
                      )}
                      <button onClick={(e) => onDeleteTilbud(t.id, t.name, e)} title="Slett tilbud">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {editOpen && (
        <ProjectFormModal initial={project} onSave={onSaveProject} onClose={() => setEditOpen(false)} />
      )}
      {newTilbudOpen && (
        <TilbudFormModal onSave={onCreateTilbud} onClose={() => setNewTilbudOpen(false)} />
      )}
      {copySource && (
        <TilbudFormModal
          title="Kopier tegning"
          submitLabel="Opprett tilbud"
          initialName={copySource.name}
          onSave={onCopyDrawing}
          onClose={() => setCopySource(null)}
        />
      )}
    </div>
  );
}
