// Eksport av mengderapporten til en nedlastbar .xlsx-fil – rent klient-side,
// ingen backend. Bruker SheetJS (xlsx), den vanlige løsningen for
// Excel-generering i nettleseren.

import * as XLSX from 'xlsx';
import type { QuantityGroup } from './quantityGroups';

/** Bygges fra de samme grupperte/sorterte gruppene som QuantityPanel viser på
 * skjermen (se quantityGroups.ts), slik at rekkefølgen i regnearket alltid stemmer
 * med det brukeren ser i mengdelisten. «Gruppe»-kolonnen lar brukeren selv
 * filtrere/sortere videre i Excel etter samme akse som er valgt på skjermen. */
export function downloadQuantityExcel(groups: QuantityGroup[], tilbudName: string) {
  const data = groups.flatMap((g) =>
    g.rows.map((r) => ({
      Gruppe: g.key,
      Underkategori: r.underkategori,
      Materiale: r.materiale,
      Dimensjon: r.dimensjon,
      'Lengde (mm)': r.lengdeMm || '',
      Antall: r.antall,
      Type: r.type,
    })),
  );

  const sheet = XLSX.utils.json_to_sheet(data);
  sheet['!cols'] = [
    { wch: 22 }, // Gruppe
    { wch: 20 }, // Underkategori
    { wch: 22 }, // Materiale
    { wch: 16 }, // Dimensjon
    { wch: 12 }, // Lengde
    { wch: 8 }, // Antall
    { wch: 16 }, // Type
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Mengdeliste');

  const safeName = tilbudName.replace(/[^a-zA-Z0-9æøåÆØÅ _-]/g, '').trim() || 'tilbud';
  XLSX.writeFile(workbook, `${safeName}-mengdeliste.xlsx`);
}
