// Tolker dimensjonsstrenger ("DN15", "Ø100", "200x100") til en millimeterverdi
// som brukes til å tegne rør/kanaler med riktig fysisk bredde på tegningen.

/** Ytre diameter i mm for rør/kanal-dimensjonen. For rektangulære kanaler
 * («200x100») brukes den største sidekanten som effektiv bredde. */
export function dimensionDiameterMm(dimension: string): number {
  const rect = dimension.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (rect) return Math.max(parseInt(rect[1], 10), parseInt(rect[2], 10));
  const num = dimension.match(/(\d+(?:[.,]\d+)?)/);
  return num ? parseFloat(num[1].replace(',', '.')) : 50;
}
