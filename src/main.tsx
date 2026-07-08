import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './site.css';
import { useStore } from './store';

// Dev-hjelper for inspeksjon/feilsøking (kun i utviklingsmodus)
if (import.meta.env.DEV) {
  (window as unknown as { __store: typeof useStore }).__store = useStore;
}

// Merk: bevisst UTEN React.StrictMode. react-konva/Konva.Stage binder native
// DOM-lyttere i konstruktøren uten tilsvarende fjerning ved StrictModes
// dev-only mount→unmount→remount-sjekk, noe som gir dupliserte
// museklikk-registreringer ved tegning. Dette er en kjent uforenelighet.
createRoot(document.getElementById('root')!).render(<App />);
