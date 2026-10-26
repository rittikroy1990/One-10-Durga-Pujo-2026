import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Loader2, MapPin, Share2 } from "lucide-react";
import api from "../../lib/api";
import { adMedia, trackAdClick } from "../../lib/adClicks";
import PublicLayout from "../../components/PublicLayout";
import { Button } from "../../components/ui";

export default function LocalBusinessPage() {
  const { slug } = useParams();
  const [ad, setAd] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api.get(`/ads/directory/${slug}`).then((r) => setAd(r.data)).catch(() => setMissing(true));
  }, [slug]);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: ad.business_name, text: ad.headline, url });
      else { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
    } catch { /* share cancelled */ }
  };

  if (missing) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-2xl px-5 py-20 text-center">
          <h1 className="font-display text-4xl text-brown-900">Not available</h1>
          <p className="mt-3 text-brown-800/70">This business page isn't live right now.</p>
          <Link to="/local-businesses" className="mt-6 inline-block text-vermilion-600 hover:underline">All local businesses</Link>
        </div>
      </PublicLayout>
    );
  }
  if (!ad) {
    return <PublicLayout><div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-vermilion-500" /></div></PublicLayout>;
  }

  const hero = adMedia(ad, "hero") || adMedia(ad, "card");
  const logo = adMedia(ad, "logo");
  const video = adMedia(ad, "video");
  const vertical = adMedia(ad, "story_vertical");
  const isStory = (ad.placements || []).includes("story_layout");
  const cta = ad.link_type !== "none" && ad.link_url ? ad.link_url : null;

  return (
    <PublicLayout>
      <div className="mx-auto max-w-5xl px-5 py-10" data-testid="local-business-page">
        <Link to="/local-businesses" className="inline-flex items-center gap-2 text-sm text-brown-800/70 hover:text-vermilion-600">
          <ArrowLeft className="h-4 w-4" /> Local businesses
        </Link>
        {hero && (
          <div className="mt-5 overflow-hidden rounded-2xl border border-sun-400/30 bg-sun-50 shadow-sm">
            <img src={hero.url} alt={ad.business_name} className="aspect-video w-full object-cover" />
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-start gap-4">
          {logo && <img src={logo.url} alt="" className="h-20 w-20 rounded-2xl border border-sun-400/30 bg-white object-contain p-1" />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-vermilion-600">
              {ad.category}
              <span className="rounded-full bg-sun-50 px-2 py-0.5 text-[10px] text-brown-800/60">Paid ad · committee reviewed</span>
            </div>
            <h1 className="mt-1 font-display text-4xl text-brown-900 sm:text-5xl">{ad.business_name}</h1>
            <p className="mt-1 text-lg text-brown-800/80">{ad.headline}</p>
            {ad.tower_or_area && <p className="mt-1 inline-flex items-center gap-1 text-sm text-brown-800/60"><MapPin className="h-4 w-4" />{ad.tower_or_area}</p>}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {cta && (ad.link_type === "external" ? (
            <a href={cta} target="_blank" rel="noopener noreferrer sponsored" onClick={() => trackAdClick(ad.id, "detail_cta")}>
              <Button variant="primary" size="lg" data-testid="local-business-cta">{ad.link_label || "Visit"} <ExternalLink className="h-4 w-4" /></Button>
            </a>
          ) : (
            <Link to={cta} onClick={() => trackAdClick(ad.id, "detail_cta")}>
              <Button variant="primary" size="lg" data-testid="local-business-cta">{ad.link_label || "Visit"}</Button>
            </Link>
          ))}
          <Button variant="outline" size="lg" onClick={share}><Share2 className="h-4 w-4" /> Share</Button>
        </div>

        <div className={`mt-8 grid gap-6 ${isStory && (vertical || video) ? "md:grid-cols-[1fr_320px]" : ""}`}>
          <div className="whitespace-pre-wrap rounded-2xl border border-sun-400/30 bg-white p-6 text-brown-800/85 shadow-sm">{ad.writeup}</div>
          {isStory && (vertical || video) && (
            <div className="space-y-4">
              {vertical && <img src={vertical.url} alt="" className="w-full rounded-2xl border border-sun-400/30 object-cover" />}
              {video && <video src={video.url} controls playsInline preload="metadata" className="w-full rounded-2xl border border-sun-400/30 bg-black" />}
            </div>
          )}
        </div>
        {!isStory && video && <video src={video.url} controls playsInline preload="metadata" className="mt-6 w-full rounded-2xl border border-sun-400/30 bg-black" />}
      </div>
    </PublicLayout>
  );
}
