export function formatINR(value: number): string {
  const absVal = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  return `${sign}₹${absVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}
