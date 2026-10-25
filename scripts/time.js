export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function restStatus(now, lastRest, cooldownSeconds) {
  if (!Number.isFinite(lastRest)) return { state: "unknown" };
  if (lastRest > now) return { state: "future", remaining: lastRest - now };
  const elapsed = now - lastRest;
  return { state: elapsed >= cooldownSeconds ? "ready" : "waiting", elapsed, remaining: Math.max(0, cooldownSeconds - elapsed) };
}

export function validateCooldown(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error("Enter a finite, non-negative number of hours.");
  return value;
}

export function compactDuration(seconds, { day, hour, minute }, labels) {
  let remaining = Math.max(0, seconds);
  const parts = [];
  for (const [unit, length] of Object.entries({ day, hour, minute })) {
    if (!Number.isFinite(length) || length <= 0) continue;
    const count = Math.floor(remaining / length);
    if (count) { parts.push(`${count}${labels[unit]}`); remaining -= count * length; }
    if (parts.length === 2) break;
  }
  return parts.join(" ") || (seconds > 0 ? `<1${labels.minute}` : `0${labels.minute}`);
}
