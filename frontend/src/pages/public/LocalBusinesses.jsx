import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Store } from "lucide-react";
import api, { API } from "../../lib/api";
import { trackAdClick } from "../../lib/adClicks";
import PublicLayout from "../../components/PublicLayout";
import { Button, Input, Select } from "../../components/ui";

function mediaUrl(docId) {
  return `${API}/ads/media/${docId}`;
}

function AdCard({ ad }) {
  const cover = (ad.media || []).find((m) => m.kind === "image") || (ad.media || [])[0];
  return (
    <Link
      to={`/local-businesses/${ad.slug}`}
      onClick={() => trackAdClick(ad.id, "directory")}
      className="group overflow-hidden rounded-2xl border border-brown-800/10 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      data-testid={`local-ad-card-${ad.slug}`}
    >
      <div className="aspect-[4/3] bg-ivory-200">
        {cover?.doc_id ? (
          cover.kind === "video" ? (
            <video src={mediaUrl(cover.doc_id)} className="h-full w-full object-cover" muted playsInline />
          ) : (
            <img src={mediaUrl(cover.doc_id)} alt={ad.business_name} className="h-full w-full object-cover" />
          )
        ) : (
          <div className="grid h-full place-items-center text-brown-800/30"><Store className="h-10 w-10" /></div>
        )}
      </div>
      <div className="p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-vermilion-600">
          {ad.location_scope === "inside_one_ten" ? "Inside One Ten" : "Outside One Ten"}
          {ad.category ? ` · ${ad.category}` : ""}
        </div>
        <h3 className="mt-1 font-display text-2xl text-brown-900 group-hover:text-vermilion-700">{ad.business_name}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-brown-800/70">{ad.headline}</p>
      </div>
    </Link>
  );
}

export default function LocalBusinesses() {
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState("");
  const [scope, setScope] = useState("");
  const [q, setQ] = useState("");
  const [categories, setCategories] = useState([]);

  const load = async () => {
    const params = {};
    if (category) params.category = category;
    if (scope) params.scope = scope;
    if (q.trim()) params.q = q.trim();
    const [{ data }, pkg] = await Promise.all([
      api.get("/ads/directory", { params }),
      api.get("/ads/packages").catch(() => ({ data: {} })),
    ]);
    setItems(data.items || []);
    setCategories(pkg.data?.categories || []);
  };

  useEffect(() => { load().catch(() => setItems([])); }, []);

  return (
    <PublicLayout>
      <section className="border-b border-brown-800/10 bg-brown-900 px-5 py-14 text-ivory-100">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold-400">Neighbourhood</p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl">Local businesses</h1>
          <p className="mt-3 max-w-2xl text-ivory-100/70">
            Committee-approved advertisements from shops inside One Ten and around the neighbourhood.
          </p>
          <div className="mt-6">
            <Link to="/advertise"><Button variant="gold">Advertise your business</Button></Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-3 rounded-2xl border border-brown-800/10 bg-white p-4 sm:grid-cols-4">
          <Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} data-testid="local-ads-search" />
          <Select value={scope} onChange={(e) => setScope(e.target.value)} data-testid="local-ads-scope">
            <option value="">All locations</option>
            <option value="inside_one_ten">Inside One Ten</option>
            <option value="outside_one_ten">Outside One Ten</option>
          </Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="local-ads-category">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Button variant="primary" onClick={() => load().catch(() => {})}>Filter</Button>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((ad) => <AdCard key={ad.id} ad={ad} />)}
        </div>
        {!items.length && (
          <div className="mt-16 text-center text-brown-800/60">
            <Store className="mx-auto h-10 w-10 opacity-40" />
            <p className="mt-3">No published ads yet. Be the first to <Link className="text-vermilion-600 underline" to="/advertise">advertise</Link>.</p>
          </div>
        )}
      </section>
    </PublicLayout>
  );
}
