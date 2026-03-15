export function buildFreshness(lastSuccessAt, maxStaleMs, nowMs = Date.now()) {
  if (!lastSuccessAt) {
    return { status: 'never_succeeded', stale: true, ageMs: null };
  }

  const lastMs = new Date(lastSuccessAt).getTime();
  if (Number.isNaN(lastMs)) {
    return { status: 'never_succeeded', stale: true, ageMs: null };
  }

  const ageMs = Math.max(0, nowMs - lastMs);
  if (ageMs > maxStaleMs) {
    return { status: 'stale', stale: true, ageMs };
  }

  return { status: 'fresh', stale: false, ageMs };
}
