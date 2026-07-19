/** USD-cents → "$1.23" for the billing UI. */
export function formatCents(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}
