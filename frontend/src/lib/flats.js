import api from "./api";

// One request per tower per page load. Towers are prefetched as soon as the tower list arrives so the flat
// picker is already filled when someone opens it — iOS never refreshes a picker that is already open.
const cache = new Map();

export function loadFlats(towerId) {
  if (!towerId) return Promise.resolve([]);
  if (!cache.has(towerId)) {
    const request = api.get(`/towers/${towerId}/flats`).then((r) => r.data.items || []);
    request.catch(() => cache.delete(towerId));
    cache.set(towerId, request);
  }
  return cache.get(towerId);
}

export function prefetchFlats(towers) {
  for (const t of towers || []) loadFlats(t.id).catch(() => {});
}
