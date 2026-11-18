/**
 * Timezone formatting helper.
 * Per AGENTS.md & API_CONTRACT.md: Times stored in UTC, shown in America/New_York.
 */

export function formatEasternTime(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}

export function formatRemainingTime(
  expiresAtIso: string | null | undefined,
  referenceIso?: string | null
): string {
  if (!expiresAtIso) return "—";
  const expiresMs = new Date(expiresAtIso).getTime();
  const nowMs = referenceIso ? new Date(referenceIso).getTime() : Date.now();
  if (Number.isNaN(expiresMs) || Number.isNaN(nowMs)) return "—";
  const diffSec = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
  if (diffSec === 0) return "Expired";
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}
