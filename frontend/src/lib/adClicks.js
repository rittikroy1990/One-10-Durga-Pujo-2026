import api from "./api";

/** Best-effort click tracking for published local-business ads. */
export function trackAdClick(adId, surface = "unknown") {
  if (!adId) return;
  api.post(`/ads/${adId}/click`, { surface }).catch(() => {});
}
