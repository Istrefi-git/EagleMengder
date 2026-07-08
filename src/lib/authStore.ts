// Mock autentisering – ingen ekte backend. Brukere og sesjon lagres i
// nettleseren (localStorage) via zustands persist-middleware. IKKE sikkert
// for produksjon (passord lagres ikke hashet) – kun til prototyping. Når en
// ekte backend kobles på senere, er det kun denne filen som må byttes ut;
// resten av appen kjenner bare grensesnittet under (register/login/logout).

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  name: string;
  email: string;
  /** Mock-passord i klartekst – kun for frontend-prototype uten backend. */
  password: string;
  createdAt: string;
}

interface AuthResult {
  ok: boolean;
  error?: string;
}

interface AuthState {
  users: User[];
  currentUserId: string | null;
  register: (name: string, email: string, password: string) => AuthResult;
  login: (email: string, password: string) => AuthResult;
  logout: () => void;
  resetPassword: (email: string, newPassword: string) => AuthResult;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

let idCounter = 0;
const nextId = () => `user_${Date.now().toString(36)}_${idCounter++}`;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      users: [],
      currentUserId: null,

      register: (name, email, password) => {
        const normalized = normalizeEmail(email);
        if (!name.trim()) return { ok: false, error: 'Navn er påkrevd.' };
        if (!normalized.includes('@')) return { ok: false, error: 'Ugyldig e-postadresse.' };
        if (password.length < 6) return { ok: false, error: 'Passordet må være minst 6 tegn.' };
        if (get().users.some((u) => u.email === normalized)) {
          return { ok: false, error: 'Det finnes allerede en konto med denne e-posten.' };
        }
        const user: User = {
          id: nextId(),
          name: name.trim(),
          email: normalized,
          password,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ users: [...s.users, user], currentUserId: user.id }));
        return { ok: true };
      },

      login: (email, password) => {
        const normalized = normalizeEmail(email);
        const user = get().users.find((u) => u.email === normalized);
        if (!user || user.password !== password) {
          return { ok: false, error: 'Feil e-post eller passord.' };
        }
        set({ currentUserId: user.id });
        return { ok: true };
      },

      logout: () => set({ currentUserId: null }),

      resetPassword: (email, newPassword) => {
        const normalized = normalizeEmail(email);
        const exists = get().users.some((u) => u.email === normalized);
        if (!exists) return { ok: false, error: 'Fant ingen konto med denne e-posten.' };
        if (newPassword.length < 6) return { ok: false, error: 'Passordet må være minst 6 tegn.' };
        set((s) => ({
          users: s.users.map((u) => (u.email === normalized ? { ...u, password: newPassword } : u)),
        }));
        return { ok: true };
      },
    }),
    { name: 'mengdemaler-auth' },
  ),
);

export function useCurrentUser(): User | null {
  return useAuthStore((s) => s.users.find((u) => u.id === s.currentUserId) ?? null);
}
