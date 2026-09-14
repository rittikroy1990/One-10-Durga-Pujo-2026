import React, { useState } from "react";
import { NavLink, Outlet, Navigate, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Wallet, Scale, BookOpenCheck, ShoppingCart, Users2, FileBarChart,
  ScrollText, Lock, Settings2, LogOut, Flower2, Menu, X, ShieldCheck, QrCode, UtensilsCrossed,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "./ui";

// Sections with hidden:true stay in code for easy revive but are not shown in the sidebar.
const NAV = [
  { to: "/admin", label: "Dashboards", icon: LayoutDashboard, end: true, perm: "reports:read" },
  { to: "/admin/collection", label: "Collection", icon: Wallet, perm: "households:read" },
  { to: "/admin/food", label: "Food", icon: UtensilsCrossed, perm: "households:read" },
  { to: "/admin/reconciliation", label: "Reconciliation", icon: Scale, perm: "recon:read", hidden: true },
  { to: "/admin/accounting", label: "Accounting", icon: BookOpenCheck, perm: "accounting:read", hidden: true },
  { to: "/admin/procurement", label: "Procurement", icon: ShoppingCart, perm: "budget:read", hidden: true },
  { to: "/admin/operations", label: "Operations", icon: Users2, perm: "ops:read", hidden: true },
  { to: "/admin/reports", label: "Reports", icon: FileBarChart, perm: "reports:read", hidden: true },
  { to: "/admin/audit", label: "Audit Trail", icon: ScrollText, perm: "audit:read", hidden: true },
  { to: "/admin/periods", label: "Period Close", icon: Lock, perm: "reports:read", hidden: true },
  { to: "/upload-qr", label: "Payment QR", icon: QrCode, perm: "settings:manage" },
  { to: "/admin/settings", label: "Settings", icon: Settings2, perm: "settings:read" },
];

export function RequireAuth({ children }) {
  const { user, loading, checkAuth } = useAuth();
  const [checking, setChecking] = React.useState(!user);

  React.useEffect(() => {
    if (user) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setChecking(true);
      await checkAuth();
      if (!cancelled) setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [user, checkAuth]);

  if (loading || checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-ivory-200">
        <Spinner className="h-8 w-8 text-vermilion-500" />
      </div>
    );
  }
  if (!user) return <Navigate to="/admin/login" replace />;
  return children;
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const perms = new Set(user?.permissions || []);
  const links = NAV.filter((n) => !n.hidden && (perms.has(n.perm) || perms.size === 0));

  const doLogout = async () => { await logout(); navigate("/admin/login"); };

  return (
    <div className="flex min-h-screen bg-ivory-200 text-brown-900 font-body">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-brown-900 text-ivory-100 transition-transform md:static md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-2.5 border-b border-gold-500/20 px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-vermilion-500"><Flower2 className="h-4 w-4" /></span>
          <div className="leading-none">
            <div className="font-display text-lg text-gradient-gold">One 10 Events</div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-ivory-100/50">EOC Admin</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 p-3">
          {links.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
              data-testid={`nav-${n.label.toLowerCase().replace(/\s/g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive ? "bg-vermilion-500 text-white" : "text-ivory-100/70 hover:bg-brown-700 hover:text-ivory-100"
                }`}>
              <n.icon className="h-4.5 w-4.5" /> {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-brown-800/10 bg-ivory-200/90 px-5 py-3 backdrop-blur">
          <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="hidden items-center gap-2 text-xs text-brown-800/50 md:flex">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> Backend-enforced roles · Asia/Kolkata · INR
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold">{user?.name || user?.email}</div>
              <div className="text-[11px] text-brown-800/50">{(user?.roles || []).join(", ") || "resident"}</div>
            </div>
            <button onClick={doLogout} data-testid="logout-btn" className="rounded-md border border-brown-800/15 p-2 hover:bg-ivory-300" title="Logout">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
