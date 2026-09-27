// Lagrer opplastede PDF-er (rå bytes) i IndexedDB. Ett tilbud kan ha FLERE opplastede
// PDF-er (flere tegninger, se DrawingEntity i types.ts) – nøkkelen er derfor
// `${tilbudId}:${pdfId}`, MED ÉN UNNTAK: `pdfId === 'legacy'` (satt av
// migrateDrawings i store.ts for tilbud lagret FØR denne støtten) leser/skriver på
// den GAMLE bare-tilbudId-nøkkelen, slik at allerede lagrede PDF-er fortsatt
// gjenfinnes uten noen fysisk databasemigrering.

import type { TilbudSnapshot } from '../store';

const DB_NAME = 'mengdemaler-pdfs';
const STORE_NAME = 'pdfs';
const DB_VERSION = 1;

/** Hvilke pdfId-er et lagret tilbud faktisk har PDF-bytes under – for kopiering/
 * sletting av et helt tilbud (se ProjectDetail.tsx). Et tilbud lagret FØR flere-
 * tegninger-støtten har ingen `drawings` ennå (migreres først når det ÅPNES, se
 * migrateDrawings i store.ts) – men HAR bytes på den gamle bare-tilbudId-nøkkelen
 * hvis det har et `fileName`, altså nøyaktig `['legacy']` (se keyFor under). */
export function pdfIdsForSnapshot(snapshot: TilbudSnapshot | null | undefined): string[] {
  if (!snapshot) return [];
  if (snapshot.drawings && snapshot.drawings.length > 0) return snapshot.drawings.map((d) => d.pdfId);
  return snapshot.fileName ? ['legacy'] : [];
}

function keyFor(tilbudId: string, pdfId: string): string {
  return pdfId === 'legacy' ? tilbudId : `${tilbudId}:${pdfId}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePdfBytes(tilbudId: string, pdfId: string, data: ArrayBuffer): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(data, keyFor(tilbudId, pdfId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadPdfBytes(tilbudId: string, pdfId: string): Promise<ArrayBuffer | null> {
  const db = await openDb();
  const result = await new Promise<ArrayBuffer | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(keyFor(tilbudId, pdfId));
    req.onsuccess = () => resolve((req.result as ArrayBuffer | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

/** Laster PDF-bytene for alle oppgitte pdfId-er i ÉN åpen tilkobling – brukt ved
 * gjenåpning av et tilbud med flere tegninger/PDF-er (se TilbudEditor.tsx). Utelater
 * en pdfId stille hvis bytene av en eller annen grunn mangler (i stedet for å feile
 * hele gjenopprettingen for de andre tegningene). */
export async function loadAllPdfBytes(
  tilbudId: string,
  pdfIds: string[],
): Promise<Record<string, ArrayBuffer>> {
  const unique = Array.from(new Set(pdfIds));
  const entries = await Promise.all(
    unique.map(async (pdfId) => [pdfId, await loadPdfBytes(tilbudId, pdfId)] as const),
  );
  const out: Record<string, ArrayBuffer> = {};
  for (const [pdfId, bytes] of entries) if (bytes) out[pdfId] = bytes;
  return out;
}

export async function deletePdfBytes(tilbudId: string, pdfId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(keyFor(tilbudId, pdfId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Sletter ALLE en tilbud sine opplastede PDF-er – brukt når hele tilbudet slettes. */
export async function deleteAllPdfBytes(tilbudId: string, pdfIds: string[]): Promise<void> {
  await Promise.all(Array.from(new Set(pdfIds)).map((pdfId) => deletePdfBytes(tilbudId, pdfId)));
}

/** Kopierer én opplastet PDF fra ett tilbud til et annet – brukt når man lager et
 * nytt tilbud på samme tegning (f.eks. for å tegne ventilasjon og rør separat på
 * samme underlag). Gjør ingenting hvis kilden ikke har noen PDF ennå. */
export async function copyPdfBytes(srcTilbudId: string, destTilbudId: string, pdfId: string): Promise<void> {
  const bytes = await loadPdfBytes(srcTilbudId, pdfId);
  if (!bytes) return;
  await savePdfBytes(destTilbudId, pdfId, bytes.slice(0));
}

/** Kopierer ALLE en tilbud sine opplastede PDF-er til et annet tilbud (samme
 * pdfId-er beholdes – DrawingEntity.pdfId er kun en lokal nøkkel per tilbud, ikke
 * global, så dette er trygt selv om «legacy» kopieres videre som «legacy»). */
export async function copyAllPdfBytes(srcTilbudId: string, destTilbudId: string, pdfIds: string[]): Promise<void> {
  await Promise.all(Array.from(new Set(pdfIds)).map((pdfId) => copyPdfBytes(srcTilbudId, destTilbudId, pdfId)));
}
