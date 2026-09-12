import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "./ui";
import BrandLogo from "./BrandLogo";
import TechSupportBrand from "./TechSupportBrand";
import api from "../lib/api";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/events", label: "Programme" },
  { to: "/nirghanto", label: "Nirghonto" },
  { to: "/donate", label: "Donate" },
  { to: "/sponsors", label: "Sponsorship" },
  { to: "/food", label: "Food" },
  { to: "/participate", label: "Participate" },
  { to: "/faq", label: "FAQ" },
  { to: "/receipt/find", label: "Receipts" },
];

export function PublicNav() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-sun-400/25 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-5 sm:py-3">
        <Link to="/" data-testid="brand-logo" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <BrandLogo imgClassName="h-9 sm:h-11 md:h-12" />
          <span className="min-w-0 leading-none">
            <span className="block font-display text-base tracking-wide text-brown-900 sm:text-lg md:text-xl">
              One 10 Durgotsav <span className="text-gradient-gold">2026</span>
            </span>
            <span className="mt-0.5 block truncate text-[9px] text-brown-800/55 sm:text-[10px]">
              3rd year · Organised by EOC
            </span>
          </span>
        </Link>
        <nav className="hidden items-center gap-0.5 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              data-testid={`nav-${l.label.toLowerCase().replace(/\s/g, "-")}`}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                loc.pathname === l.to ? "text-vermilion-500" : "text-brown-800/70 hover:text-brown-900"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Link to="/subscribe">
            <Button variant="primary" size="sm" data-testid="nav-subscribe-btn" className="ml-3">
              Subscribe & Pay
            </Button>
          </Link>
          <Link to="/admin" data-testid="nav-committee" className="ml-1 px-3 py-2 text-[11px] uppercase tracking-wider text-brown-800/40 hover:text-vermilion-500">
            Committee
          </Link>
        </nav>
        <button className="text-brown-900 md:hidden" onClick={() => setOpen(!open)} data-testid="mobile-menu-btn" aria-label="Menu">
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div className="border-t border-sun-400/20 bg-white px-5 py-3 md:hidden">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="block py-2.5 text-brown-900/85">
              {l.label}
            </Link>
          ))}
          <Link to="/subscribe" onClick={() => setOpen(false)}>
            <Button variant="primary" size="sm" className="mt-2 w-full">Subscribe & Pay</Button>
          </Link>
          <Link to="/admin" onClick={() => setOpen(false)} className="mt-2 block py-2 text-xs uppercase tracking-wider text-brown-800/45">
            Committee Login
          </Link>
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
  const address = org?.address || "One10 Residential Complex, Thakdari, Newtown, Action Area 1, Kolkata – 700102";

  return (
    <footer className="relative overflow-hidden border-t border-sun-400/30 bg-gradient-to-b from-sun-50 to-sky-100 text-brown-800/75">
      <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="font-display text-2xl text-brown-900 sm:text-3xl">
            One 10 Durgotsav <span className="text-gradient-gold">2026</span>
          </p>
          <p className="mt-1 text-sm uppercase tracking-[0.2em] text-vermilion-500">
            3rd year Durga Puja · Organised by EOC
          </p>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-brown-800/80">
            One 10 Durgotsav organised by EOC — voluntary non-profit community association for cultural celebrations.
          </p>
          <p className="mt-3 text-xs text-brown-800/50">{address}</p>
          <p className="mt-2 text-xs">
            <a href="https://one10events.in" className="text-vermilion-500 hover:underline">one10events.in</a>
          </p>
          <p className="mt-4 text-xs text-brown-800/45">
            A receipt is issued only after payment is verified. Please do not treat screenshots as proof of payment.
          </p>
        </div>
        <div>
          <div className="mb-3 text-xs uppercase tracking-widest text-vermilion-500">Portal</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/subscribe" className="hover:text-brown-900">Subscribe & Pay</Link></li>
            <li><Link to="/donate" className="hover:text-brown-900">Donate</Link></li>
            <li><Link to="/faq" className="hover:text-brown-900">FAQ & site guide</Link></li>
            <li><Link to="/events" className="hover:text-brown-900">Programme</Link></li>
            <li><Link to="/nirghanto" className="hover:text-brown-900">Nirghonto</Link></li>
            <li><Link to="/food" className="hover:text-brown-900">Food</Link></li>
            <li><Link to="/receipt/find" className="hover:text-brown-900">Find Receipt</Link></li>
            <li><Link to="/participate" className="hover:text-brown-900">Participate</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-xs uppercase tracking-widest text-vermilion-500">Legal</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/privacy" className="hover:text-brown-900">Privacy Policy</Link></li>
            <li><Link to="/terms" className="hover:text-brown-900">Terms & Conditions</Link></li>
            <li><Link to="/refunds" className="hover:text-brown-900">Refunds & Cancellations</Link></li>
            <li><Link to="/contact" className="hover:text-brown-900">Contact Us</Link></li>
          </ul>
        </div>
      </div>
      <div className="relative border-t border-sun-400/25 bg-white/70 px-5 py-8">
        <div className="mx-auto max-w-7xl">
          <TechSupportBrand />
          <p className="mt-5 text-center text-xs text-brown-800/45">
            © {new Date().getFullYear()} EOC. One 10 Durgotsav · Organised by EOC · Website one10events.in
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function PublicLayout({ children }) {
  return (
    <div className="min-h-screen bg-sky-50 font-body text-brown-900">
      <PublicNav />
      <main className="pt-16 sm:pt-20">{children}</main>
      <PublicFooter />
    </div>
  );
}
