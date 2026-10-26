import { useEffect, useState } from "react";
import api from "./api";

export function trackAdClick(adId, placement) {
  if (!adId) return;
  api.post(`/ads/${adId}/click`, { placement }).catch(() => {});
}

let catalogPromise = null;

export function loadAdsCatalog() {
  if (!catalogPromise) {
    catalogPromise = api.get("/ads/packages").then((r) => r.data).catch(() => {
      catalogPromise = null;
      return null;
    });
  }
  return catalogPromise;
}

/** True when the public can see ads (flag on), or a signed-in reviewer is previewing. */
export function useAdsOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    loadAdsCatalog().then((c) => alive && setOpen(!!c?.apply_open));
    return () => { alive = false; };
  }, []);
  return open;
}

export function adMedia(ad, kind) {
  return (ad?.media || []).find((m) => m.kind === kind) || null;
}

export function adLinkHref(ad) {
  if (!ad || ad.link_type === "none" || !ad.link_url) return null;
  return ad.link_url;
}
