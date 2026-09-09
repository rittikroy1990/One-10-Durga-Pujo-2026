import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Flower2 } from "lucide-react";
import { Button } from "./ui";
import api from "../lib/api";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/events", label: "Programme" },
  { to: "/nirghanto", label: "Nirghonto" },
  { to: "/sponsors", label: "Sponsors" },
  { to: "/participate", label: "Participate" },
  { to: "/receipt/find", label: "Find Receipt" },
  { to: "/faq", label: "FAQ" },
  { to: "/transparency", label: "Transparency" },
];

export function PublicNav() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  return (
    <header className="sticky top-0 z-40 border-b border-gold-500/20 bg-brown-900/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5">
        <Link to="/" data-testid="brand-logo" className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-vermilion-500 text-ivory-100">
            <Flower2 className="h-5 w-5" />
          </span>
          <span className="leading-none">
            <span className="block font-display text-xl text-gradient-gold">One 10 Events</span>
            <span className="block text-[11px] uppercase tracking-[0.3em] text-ivory-100/60">EOC · Community</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              data-testid={`nav-${l.label.toLowerCase().replace(/\s/g, "-")}`}
              className={`px-3 py-2 text-sm font-semibold transition-colors ${
                loc.pathname === l.to ? "text-gold-400" : "text-ivory-100/75 hover:text-ivory-100"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Link to="/subscribe">
            <Button variant="primary" size="sm" data-testid="nav-subscribe-btn" className="ml-2">
              Subscribe & Pay
            </Button>
          </Link>
          <Link to="/admin" data-testid="nav-committee" className="ml-1 px-3 py-2 text-xs uppercase tracking-wider text-ivory-100/50 hover:text-gold-400">
            Committee
          </Link>
        </nav>
        <button className="md:hidden text-ivory-100" onClick={() => setOpen(!open)} data-testid="mobile-menu-btn" aria-label="Menu">
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div className="border-t border-gold-500/20 bg-brown-900 px-5 py-3 md:hidden">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="block py-2 text-ivory-100/80">
              {l.label}
            </Link>
          ))}
          <Link to="/subscribe" onClick={() => setOpen(false)}>
            <Button variant="primary" size="sm" className="mt-2 w-full">Subscribe & Pay</Button>
          </Link>
          <Link to="/admin" onClick={() => setOpen(false)} className="block py-2 text-xs uppercase tracking-wider text-ivory-100/50">Committee Login</Link>
        </div>
      )}
    </header>
  );
}

export function PublicFooter() {
  const [org, setOrg] = useState(null);
  useEffect(() => {
    api.get("/config").then((r) => setOrg(r.data.organisation)).catch(() => {});
  }, []);
  const name = org?.organiser || "Events Organizations Committee of One10";
  const address = org?.address || "One10 Residential Complex, Thakdari, Newtown, Action Area 1, Kolkata – 700102";

  return (
    <footer className="border-t border-gold-500/20 bg-brown-900 text-ivory-100/70">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="font-display text-2xl text-gradient-gold">One 10 Events</div>
          <p className="mt-2 max-w-md text-sm">
            {name} — voluntary non-profit community association for cultural and community events at One10.
          </p>
          <p className="mt-2 text-xs text-ivory-100/45">{address}</p>
          <p className="mt-3 text-xs text-ivory-100/40">A receipt is issued only after payment is verified. Please do not treat screenshots as proof of payment.</p>
        </div>
        <div>
          <div className="mb-2 text-xs uppercase tracking-widest text-gold-400">Portal</div>
          <ul className="space-y-1.5 text-sm">
            <li><Link to="/subscribe" className="hover:text-ivory-100">Subscribe & Pay</Link></li>
            <li><Link to="/faq" className="hover:text-ivory-100">FAQ & site guide</Link></li>
            <li><Link to="/receipt/find" className="hover:text-ivory-100">Find Receipt</Link></li>
            <li><Link to="/sponsors" className="hover:text-ivory-100">Sponsorship</Link></li>
            <li><Link to="/participate" className="hover:text-ivory-100">Participate</Link></li>
            <li><Link to="/events" className="hover:text-ivory-100">Programme</Link></li>
            <li><Link to="/transparency" className="hover:text-ivory-100">Public Transparency</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-2 text-xs uppercase tracking-widest text-gold-400">Legal</div>
          <ul className="space-y-1.5 text-sm">
            <li><Link to="/privacy" className="hover:text-ivory-100">Privacy Policy</Link></li>
            <li><Link to="/terms" className="hover:text-ivory-100">Terms</Link></li>
            <li><Link to="/refund-policy" className="hover:text-ivory-100">Refund Policy</Link></li>
            <li><Link to="/contact" className="hover:text-ivory-100">Contact Committee</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-gold-500/10 py-4 text-center text-xs text-ivory-100/40">
        © {new Date().getFullYear()} {name}. Built for transparent, audit-ready collection.
      </div>
    </footer>
  );
}

export default function PublicLayout({ children }) {
  return (
    <div className="min-h-screen bg-brown-800 text-ivory-100">
      <PublicNav />
      <main>{children}</main>
      <PublicFooter />
    </div>
  );
}
