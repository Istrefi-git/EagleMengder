import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Pencil, Plus, Trash2 } from 'lucide-react';
import { SiteNav } from '../components/site/SiteNav';
import { ProjectFormModal, type ProjectFormValues } from '../components/site/ProjectFormModal';
import { useCurrentUser } from '../lib/authStore';
import { useProjectsStore, type Project } from '../lib/projectsStore';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Dashboard() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const projects = useProjectsStore((s) => s.projects);
  const addProject = useProjectsStore((s) => s.addProject);
  const updateProject = useProjectsStore((s) => s.updateProject);
  const deleteProject = useProjectsStore((s) => s.deleteProject);
  const tilbudList = useProjectsStore((s) => s.tilbud);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const myProjects = projects.filter((p) => p.ownerId === user?.id);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(p: Project) {
    setEditing(p);
    setModalOpen(true);
  }
  function onSave(values: ProjectFormValues) {
    if (editing) {
      updateProject(editing.id, values);
    } else if (user) {
      addProject(values, user.id);
    }
    setModalOpen(false);
  }
  function onDelete(p: Project, e: React.MouseEvent) {
    e.stopPropagation();
    if (window.confirm(`Slette prosjektet «${p.name}»? Dette fjerner også alle tilbud i prosjektet.`)) {
      deleteProject(p.id);
    }
  }

  return (
    <div className="site">
      <SiteNav />
      <div className="site-page">
        <div className="site-page-body">
          <div className="site-page-header">
            <div>
              <h1 className="site-page-title">Prosjekter</h1>
              <p className="site-page-sub">Velg et prosjekt, eller opprett et nytt.</p>
            </div>
            <button className="site-btn primary" onClick={openCreate}>
              <Plus size={16} />
              Nytt prosjekt
            </button>
          </div>

          {myProjects.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <FolderKanban size={24} />
              </div>
              <h3>Ingen prosjekter ennå</h3>
              <p>Opprett ditt første prosjekt for å begynne å lage tilbud og måle opp tegninger.</p>
              <button className="site-btn primary" onClick={openCreate}>
                <Plus size={16} />
                Nytt prosjekt
              </button>
            </div>
          ) : (
            <div className="project-grid">
              {myProjects.map((p) => {
                const count = tilbudList.filter((t) => t.projectId === p.id).length;
                return (
                  <div className="project-card" key={p.id} onClick={() => navigate(`/projects/${p.id}`)}>
                    <div className="project-card-head">
                      <span className="project-card-name">{p.name}</span>
                      {p.projectNumber && <span className="project-card-number">{p.projectNumber}</span>}
                    </div>
                    {p.customer && <span className="project-card-customer">{p.customer}</span>}
                    {p.description && <p className="project-card-desc">{p.description}</p>}
                    <div className="project-card-footer">
                      <span>
                        {count} {count === 1 ? 'tilbud' : 'tilbud'} · {formatDate(p.createdAt)}
                      </span>
                      <div className="project-card-actions">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(p);
                          }}
                          title="Rediger"
                        >
                          <Pencil size={14} />
                        </button>
                        <button onClick={(e) => onDelete(p, e)} title="Slett">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <ProjectFormModal initial={editing} onSave={onSave} onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}
