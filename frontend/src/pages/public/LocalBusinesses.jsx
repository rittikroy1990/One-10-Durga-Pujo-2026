import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Search, Store } from "lucide-react";
import api from "../../lib/api";
import { loadAdsCatalog } from "../../lib/adClicks";
import PublicLayout from "../../components/PublicLayout";
import { AdCard } from "../../components/LocalAds";
import { Button, Input, Select } from "../../components/ui";

export default function LocalBusinesses() {
  const [catalog, setCatalog] = useState(null);
  const [items, setItems] = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("");
  const [scope, setScope] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => { loadAdsCatalog().then(setCatalog); }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      api.get("/ads/directory", { params: { category, scope, q } })
        .then((r) => { setItems(r.data.items || []); setEnabled(r.data.enabled !== false); setMessage(r.data.message || ""); })
        .catch(() => setItems([]));
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [category, scope, q]);

  return (
    <PublicLayout>
      <section className="border-b border-sun-400/25 bg-gradient-to-r from-sky-50 via-sun-50 to-sky-50">
        <div className="mx-auto max-w-7xl px-5 py-14">
          <p className="text-xs uppercase tracking-[0.3em] text-vermilion-600">Neighbourhood</p>
          <h1 className="mt-2 font-display text-5xl text-brown-900">Local businesses</h1>
          <p className="mt-3 max-w-2xl text-brown-800/75">Shops, kitchens, tutors and services from One Ten and around — supporting this year's Durgotsav.</p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 py-10" data-testid="local-businesses-page">
        {!enabled ? (
          <div className="rounded-2xl border border-sun-400/30 bg-white p-10 text-center shadow-sm" data-testid="local-businesses-coming-soon">
            <Store className="mx-auto h-10 w-10 text-vermilion-500/50" />
            <p className="mt-3 font-display text-2xl text-brown-900">Coming soon</p>
            <p className="mt-1 text-brown-800/70">{message}</p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-[1fr_220px_200px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brown-800/40" />
                <Input className="pl-9" placeholder="Search name or offer" value={q} onChange={(e) => setQ(e.target.value)} data-testid="directory-search" />
              </div>
              <Select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="directory-category">
                <option value="">All categories</option>
                {(catalog?.categories || []).map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Select value={scope} onChange={(e) => setScope(e.target.value)} data-testid="directory-scope">
                <option value="">Inside & outside</option>
                <option value="inside_one_ten">Inside One Ten</option>
                <option value="outside_one_ten">Neighbourhood</option>
              </Select>
            </div>

            {items === null ? (
              <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin text-vermilion-500" />
            ) : items.length ? (
              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((ad) => <AdCard key={ad.id} ad={ad} placement="directory" />)}
              </div>
            ) : (
              <div className="mt-10 rounded-2xl border border-dashed border-sun-400/50 bg-white p-10 text-center" data-testid="directory-empty">
                <p className="text-brown-800/75">
                  {category || scope || q ? "No businesses match these filters." : "No neighbourhood businesses published yet. Be the first —"}
                </p>
                <Link to="/promote" className="mt-4 inline-block"><Button variant="primary">Promote your business</Button></Link>
              </div>
            )}
          </>
        )}
      </div>
    </PublicLayout>
  );
}
