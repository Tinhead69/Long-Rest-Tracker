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
