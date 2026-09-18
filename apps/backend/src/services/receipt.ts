export function formatReceipt(lines: Array<{ name: string; quantity: number; unitPriceCents: number }>, totalCents: number, width: 58 | 80 = 58) {
  const columns = width === 58 ? 32 : 48;
  const out = ["ANGOLA COMMERCE".padStart((columns + 14) / 2), "-".repeat(columns)];
  for (const line of lines) {
    const label = `${line.quantity}x ${line.name}`.slice(0, columns - 11);
    out.push(`${label.padEnd(columns - 11)} ${(line.quantity * line.unitPriceCents / 100).toFixed(2).padStart(10)} Kz`);
  }
  out.push("-".repeat(columns), `TOTAL${(totalCents / 100).toFixed(2).padStart(columns - 6)} Kz`, "\x1d\x56\x00");
  return out.join("\n");
}
