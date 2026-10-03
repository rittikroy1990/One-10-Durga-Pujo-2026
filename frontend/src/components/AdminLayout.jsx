import React, { useState } from "react";
import { NavLink, Outlet, Navigate, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Wallet, Scale, BookOpenCheck, ShoppingCart, Users2, FileBarChart,
  ScrollText, Lock, Settings2, LogOut, Flower2, Menu, X, ShieldCheck, QrCode, Receipt,
  UtensilsCrossed, ClipboardList,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "./ui";

const NAV = [
  { to: "/admin", label: "Control Tower", icon: LayoutDashboard, end: true, perm: "reports:read" },
  { to: "/admin/collection", label: "Collection", icon: Wallet, perm: "households:read" },
  { to: "/admin/expenses", label: "Expenses", icon: Receipt, perm: "budget:read" },
  { to: "/admin/food", label: "Food subscriptions", icon: ClipboardList, perm: "households:read" },
  { to: "/admin/food-menu", label: "Food Menu", icon: UtensilsCrossed, perm: "households:read" },
  {
    to: "/admin/payment-qrs",
    label: "Payment QRs",
    icon: QrCode,
    anyPerm: ["payments:manage", "receipts:manage"],
  },
  // Hidden for now — finance/ops modules not needed in current committee workflow
  { to: "/admin/reconciliation", label: "Reconciliation", icon: Scale, perm: "recon:read", hidden: true },
  { to: "/admin/accounting", label: "Accounting", icon: BookOpenCheck, perm: "accounting:read", hidden: true },
  { to: "/admin/procurement", label: "Procurement", icon: ShoppingCart, perm: "budget:read", hidden: true },
  { to: "/admin/operations", label: "Operations", icon: Users2, perm: "ops:read", hidden: true },
  { to: "/admin/reports", label: "Reports", icon: FileBarChart, perm: "reports:read", hidden: true },
  { to: "/admin/audit", label: "Audit", icon: ScrollText, perm: "audit:read", hidden: true },
  { to: "/admin/periods", label: "Period close", icon: Lock, perm: "reports:read", hidden: true },
  { to: "/admin/settings", label: "Settings", icon: Settings2, perm: "settings:read" },
  { to: "/admin/portal", label: "Admin Portal", icon: ShieldCheck, perm: "users:manage" },
];

function canSeeNav(item, perms) {
  if (item.hidden) return false;
  if (perms.size === 0) return true;
  if (item.anyPerm?.length) return item.anyPerm.some((p) => perms.has(p));
  return perms.has(item.perm);
}

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center bg-ivory-200"><Spinner className="h-8 w-8 text-vermilion-500" /></div>;
  if (!user) return <Navigate to="/admin/login" replace />;
  return children;
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const perms = new Set(user?.permissions || []);
  const links = NAV.filter((n) => canSeeNav(n, perms));

  const doLogout = async () => { await logout(); navigate("/admin/login"); };

  return (
    <div className="flex min-h-screen bg-ivory-200 text-brown-900 font-body">
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-brown-900 text-ivory-100 transition-transform md:static md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-2.5 border-b border-gold-500/20 px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-vermilion-500"><Flower2 className="h-4 w-4" /></span>
          <div className="leading-none">
            <div className="font-display text-lg">One 10 Events</div>
            <div className="text-[10px] uppercase tracking-wider text-gold-500/80">EOC Admin</div>
          </div>
        </div>
        <nav className="space-y-0.5 p-3">
          {links.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition ${
                  isActive ? "bg-vermilion-500 text-white" : "text-ivory-100/70 hover:bg-white/5 hover:text-ivory-100"
                }`
              }
            >
              <n.icon className="h-4 w-4 shrink-0" />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-brown-800/10 bg-ivory-100 px-4 py-3 md:px-6">
          <button type="button" className="md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <div className="text-right leading-tight">
              <div className="font-semibold">{user?.name || user?.login_id}</div>
              <div className="text-xs text-brown-800/45">{(user?.roles || []).join(", ")}</div>
            </div>
            <button type="button" onClick={doLogout} className="rounded-lg p-2 hover:bg-brown-800/5" aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
