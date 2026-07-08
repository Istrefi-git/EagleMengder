// Eksport av mengderapporten til en nedlastbar .xlsx-fil – rent klient-side,
// ingen backend. Bruker SheetJS (xlsx), den vanlige løsningen for
// Excel-generering i nettleseren.

import * as XLSX from 'xlsx';
import type { QuantityReport } from './quantityReport';

export function downloadQuantityExcel(report: QuantityReport, tilbudName: string) {
  const data = report.rows.map((r) => ({
    System: r.system,
    Underkategori: r.underkategori,
    Materiale: r.materiale,
    Dimensjon: r.dimensjon,
    'Lengde (mm)': r.lengdeMm || '',
    Antall: r.antall,
    Type: r.type,
  }));

  const sheet = XLSX.utils.json_to_sheet(data);
  sheet['!cols'] = [
    { wch: 22 }, // System
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
