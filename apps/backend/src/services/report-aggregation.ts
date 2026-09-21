export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
export function average(values: number[]): number { return values.length ? Math.round(sum(values) / values.length) : 0; }
export function groupByDay<T extends { date: Date; amountCents: number }>(rows: T[]) {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    const date = row.date.toISOString().slice(0, 10);
    grouped.set(date, (grouped.get(date) ?? 0) + row.amountCents);
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, amountCents]) => ({ date, amountCents }));
}
