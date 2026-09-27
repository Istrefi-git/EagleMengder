// Eksport av mengderapporten til en nedlastbar .xlsx-fil – rent klient-side,
// ingen backend. Bruker SheetJS (xlsx), den vanlige løsningen for
// Excel-generering i nettleseren.

import * as XLSX from 'xlsx';
import type { QuantityGroup } from './quantityGroups';

function quantitySheetData(groups: QuantityGroup[]) {
  return groups.flatMap((g) =>
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
}

/** Bygges fra de samme grupperte/sorterte gruppene som QuantityPanel viser på
 * skjermen (se quantityGroups.ts), slik at rekkefølgen i regnearket alltid stemmer
 * med det brukeren ser i mengdelisten. «Gruppe»-kolonnen lar brukeren selv
 * filtrere/sortere videre i Excel etter samme akse som er valgt på skjermen.
 *
 * `perDrawing` (én oppføring per tegning i tilbudet) gir en EKSTRA fane «Per
 * tegning» med en «Tegning»-kolonne fremst og autofilter på overskriftsraden, slik
 * at man kan sortere/filtrere mengdene per tegning – i tillegg til totalfanen
 * «Mengdeliste», som er uendret. */
export function downloadQuantityExcel(
  totalGroups: QuantityGroup[],
  perDrawing: { name: string; groups: QuantityGroup[] }[],
  tilbudName: string,
) {
  const totalSheet = XLSX.utils.json_to_sheet(quantitySheetData(totalGroups));
  totalSheet['!cols'] = [
    { wch: 22 }, // Gruppe
    { wch: 20 }, // Underkategori
    { wch: 22 }, // Materiale
    { wch: 16 }, // Dimensjon
    { wch: 12 }, // Lengde
    { wch: 8 }, // Antall
    { wch: 16 }, // Type
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, totalSheet, 'Mengdeliste');

  const perDrawingData = perDrawing.flatMap(({ name, groups }) =>
    groups.flatMap((g) =>
      g.rows.map((r) => ({
        Tegning: name,
        Gruppe: g.key,
        Underkategori: r.underkategori,
        Materiale: r.materiale,
        Dimensjon: r.dimensjon,
        'Lengde (mm)': r.lengdeMm || '',
        Antall: r.antall,
        Type: r.type,
      })),
    ),
  );
  const perDrawingSheet = XLSX.utils.json_to_sheet(perDrawingData);
  perDrawingSheet['!cols'] = [
    { wch: 24 }, // Tegning
    { wch: 22 }, // Gruppe
    { wch: 20 }, // Underkategori
    { wch: 22 }, // Materiale
    { wch: 16 }, // Dimensjon
    { wch: 12 }, // Lengde
    { wch: 8 }, // Antall
    { wch: 16 }, // Type
  ];
  // Autofilter på overskriftsraden – lar brukeren sortere/filtrere på Tegning (eller
  // hvilken som helst annen kolonne) direkte i Excel.
  if (perDrawingData.length > 0) {
    perDrawingSheet['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: perDrawingData.length, c: 7 } }),
    };
  }
  XLSX.utils.book_append_sheet(workbook, perDrawingSheet, 'Per tegning');

  const safeName = tilbudName.replace(/[^a-zA-Z0-9æøåÆØÅ _-]/g, '').trim() || 'tilbud';
  XLSX.writeFile(workbook, `${safeName}-mengdeliste.xlsx`);
}
