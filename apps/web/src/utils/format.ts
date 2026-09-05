export const formatInterval = (seconds: number) => {
  if (seconds >= 86400) {
    const days = Math.round(seconds / 86400);
    return `${days} day${days > 1 ? 's' : ''}`;
  }
  if (seconds >= 3600) {
    const hours = Math.round(seconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  if (seconds >= 60) {
    const minutes = Math.round(seconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
};

export const formatStartTime = (timestamp: number) => {
  if (timestamp === 0) return "Immediately";
  return new Date(timestamp * 1000).toLocaleString();
};

/**
 * Shortens a blockchain address for display purposes.
 * Defaults to 6 chars start / 4 chars end, improving UI readability.
 */
export function truncateAddress(address: string, start = 6, end = 6): string {
  if (!address || typeof address !== 'string') return "";
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

/**
 * Formats a raw 18-decimal STRK value (bigint) to a human-readable string.
 * StarkAudit balances and fees are denominated in STRK.
 */
export function formatNumber(raw: bigint): string {
  const whole = raw / 10n ** 18n;
  const frac = ((raw % 10n ** 18n) / 10n ** 15n).toString().padStart(3, "0");
  return `${whole.toString()}.${frac}`;
}
