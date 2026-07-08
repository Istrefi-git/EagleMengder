// Prosjekt- og tilbudsregister. Frontend-only (localStorage via zustands
// persist-middleware) – strukturert slik at en ekte backend kan kobles på
// senere uten at sidene som bruker disse hookene må endres.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TilbudSnapshot } from '../store';

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  customer: string;
  projectNumber: string;
  address: string;
  description: string;
  createdAt: string;
}

export interface Tilbud {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  /** Mengdedata for tilbudet – satt når brukeren tegner/måler i tilbudseditoren. */
  snapshot: TilbudSnapshot | null;
}

interface ProjectsState {
  projects: Project[];
  tilbud: Tilbud[];

  addProject: (data: Omit<Project, 'id' | 'ownerId' | 'createdAt'>, ownerId: string) => Project;
  updateProject: (id: string, patch: Partial<Omit<Project, 'id' | 'ownerId' | 'createdAt'>>) => void;
  deleteProject: (id: string) => void;

  addTilbud: (projectId: string, name: string) => Tilbud;
  deleteTilbud: (id: string) => void;
  saveTilbudSnapshot: (id: string, snapshot: TilbudSnapshot) => void;
}

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${idCounter++}`;

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set) => ({
      projects: [],
      tilbud: [],

      addProject: (data, ownerId) => {
        const project: Project = {
          id: nextId('proj'),
          ownerId,
          createdAt: new Date().toISOString(),
          ...data,
        };
        set((s) => ({ projects: [...s.projects, project] }));
        return project;
      },

      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      deleteProject: (id) =>
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          tilbud: s.tilbud.filter((t) => t.projectId !== id),
        })),

      addTilbud: (projectId, name) => {
        const t: Tilbud = {
          id: nextId('tilbud'),
          projectId,
          name,
          createdAt: new Date().toISOString(),
          snapshot: null,
        };
        set((s) => ({ tilbud: [...s.tilbud, t] }));
        return t;
      },

      deleteTilbud: (id) => set((s) => ({ tilbud: s.tilbud.filter((t) => t.id !== id) })),

      saveTilbudSnapshot: (id, snapshot) =>
        set((s) => ({
          tilbud: s.tilbud.map((t) => (t.id === id ? { ...t, snapshot } : t)),
        })),
    }),
    { name: 'mengdemaler-projects' },
  ),
);
