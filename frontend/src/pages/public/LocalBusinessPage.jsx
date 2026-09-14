import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ExternalLink, MapPin, Store } from "lucide-react";
import api, { API } from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";

function mediaUrl(docId) {
  return `${API}/ads/media/${docId}`;
}

export default function LocalBusinessPage() {
  const { slug } = useParams();
  const [ad, setAd] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/ads/directory/${slug}`)
      .then((r) => setAd(r.data))
      .catch(() => setError("This advertisement is not available."));
  }, [slug]);

  if (error) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-xl px-5 py-24 text-center">
          <Store className="mx-auto h-10 w-10 text-brown-800/30" />
          <h1 className="mt-4 font-display text-3xl text-brown-900">{error}</h1>
          <Link to="/local-businesses" className="mt-6 inline-block text-vermilion-600 underline">Back to directory</Link>
        </div>
      </PublicLayout>
    );
  }

  if (!ad) {
    return <PublicLayout><div className="grid min-h-[50vh] place-items-center text-brown-800/50">Loading…</div></PublicLayout>;
  }

  const hero = (ad.media || []).find((m) => m.kind === "image") || (ad.media || [])[0];
  const video = (ad.media || []).find((m) => m.kind === "video");
  const isTakeover = (ad.placements || []).includes("takeover") || (ad.placements || []).includes("story_layout");
  const cta = ad.link_type === "external" ? (
    <a href={ad.link_url} target="_blank" rel="noopener noreferrer">
      <Button variant="primary" size="lg">{ad.link_label || "Visit"} <ExternalLink className="h-4 w-4" /></Button>
    </a>
  ) : ad.link_type === "internal" ? (
    <Link to={ad.link_url || "/"}><Button variant="primary" size="lg">{ad.link_label || "Visit"}</Button></Link>
  ) : null;

  return (
    <PublicLayout>
      <section className={`relative overflow-hidden ${isTakeover ? "min-h-[70vh]" : "min-h-[48vh]"} bg-brown-900 text-ivory-100`}>
        {hero?.doc_id && hero.kind === "image" && (
          <img src={mediaUrl(hero.doc_id)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-brown-950 via-brown-900/70 to-brown-900/30" />
        <div className="relative mx-auto flex max-w-5xl flex-col justify-end px-5 pb-12 pt-28">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold-400">
            {ad.location_scope === "inside_one_ten" ? "Inside One Ten" : "Outside One Ten"}
            {ad.category ? ` · ${ad.category}` : ""}
          </p>
          <h1 className="mt-3 font-display text-5xl sm:text-6xl">{ad.business_name}</h1>
          <p className="mt-3 max-w-2xl text-lg text-ivory-100/80">{ad.headline}</p>
          {(ad.tower_or_area || ad.location_scope) && (
            <p className="mt-4 flex items-center gap-2 text-sm text-ivory-100/60">
              <MapPin className="h-4 w-4" /> {ad.tower_or_area || (ad.location_scope === "inside_one_ten" ? "One Ten" : "Near One Ten")}
            </p>
          )}
          <div className="mt-8">{cta}</div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-12">
        <h2 className="font-display text-3xl text-brown-900">About</h2>
        <p className="mt-4 whitespace-pre-wrap text-lg leading-relaxed text-brown-800/80">{ad.writeup}</p>
        {video?.doc_id && (
          <video className="mt-8 w-full rounded-2xl border border-brown-800/10" controls src={mediaUrl(video.doc_id)} />
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          {cta}
          <Link to="/local-businesses"><Button variant="subtle">All local businesses</Button></Link>
          <Link to="/advertise"><Button variant="ghost">Advertise yours</Button></Link>
        </div>
      </section>
    </PublicLayout>
  );
}
