import React, { useState, createContext, useContext } from "react";
import { cn } from "../lib/utils";
import { X, Loader2 } from "lucide-react";

/* Button */
export function Button({ variant = "primary", size = "md", className, children, ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed select-none";
  const variants = {
    primary: "bg-vermilion-500 text-white hover:bg-vermilion-600 rounded-full",
    gold: "bg-gold-500 text-brown-900 hover:bg-gold-400 rounded-full",
    outline:
      "border border-gold-500/60 text-ivory-100 hover:bg-gold-500/10 rounded-full",
    dark: "bg-brown-800 text-ivory-100 hover:bg-brown-700 rounded-md",
    ghost: "text-brown-800 hover:bg-ivory-300 rounded-md",
    admin: "bg-brown-800 text-ivory-100 hover:bg-brown-700 rounded-md",
    danger: "bg-vermilion-500 text-white hover:bg-vermilion-600 rounded-md",
    subtle: "bg-ivory-300 text-brown-800 hover:bg-gold-500/20 rounded-md border border-brown-800/10",
  };
  const sizes = { sm: "text-sm px-3 py-1.5 min-h-[36px]", md: "px-5 py-2.5 min-h-[44px]", lg: "px-7 py-3 text-lg min-h-[52px]" };
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </button>
  );
}

/* Card */
export function Card({ className, children, ...props }) {
  return (
    <div className={cn("rounded-xl bg-white border border-brown-800/10 shadow-card", className)} {...props}>
      {children}
    </div>
  );
}
export function CardBody({ className, children }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

/* Label + Field */
export function Label({ className, children, htmlFor, required }) {
  return (
    <label htmlFor={htmlFor} className={cn("block text-sm font-semibold text-brown-800 mb-1.5", className)}>
      {children} {required && <span className="text-vermilion-500">*</span>}
    </label>
  );
}

/* Input */
export const Input = React.forwardRef(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-md border border-brown-800/20 bg-white px-3.5 py-2.5 text-brown-900 placeholder:text-brown-800/40 focus:outline-none focus:ring-2 focus:ring-gold-500 min-h-[44px]",
        className
      )}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md border border-brown-800/20 bg-white px-3.5 py-2.5 text-brown-900 placeholder:text-brown-800/40 focus:outline-none focus:ring-2 focus:ring-gold-500 min-h-[88px]",
        className
      )}
      {...props}
    />
  );
});

export const Select = React.forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        "w-full rounded-md border border-brown-800/20 bg-white px-3.5 py-2.5 text-brown-900 focus:outline-none focus:ring-2 focus:ring-gold-500 min-h-[44px]",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});

/* Badge / StatusBadge */
const STATUS_MAP = {
  issued: "emerald", paid: "emerald", captured: "emerald", verified: "emerald", valid: "emerald",
  approved: "emerald", cleared: "emerald", completed: "emerald", accepted: "emerald", locked: "emerald", active: "emerald",
  payment_pending: "gold", pending: "gold", pending_acceptance: "gold", pending_match: "gold",
  pending_clearing: "gold", processing: "gold", proposed: "gold", submitted: "gold", requested: "gold",
  outstanding: "gold", prepared: "gold", interested: "gold", review: "amber", reconciliation_required: "amber",
  exception: "amber", suggested: "amber", partially_refunded: "amber", reopened: "amber",
  failed: "red", refunded: "red", cancelled: "red", expired: "red", signature_invalid: "red", refund_review: "red",
};
export function StatusBadge({ status, className }) {
  const key = String(status || "").toLowerCase();
  const color = STATUS_MAP[key] || "slate";
  const styles = {
    emerald: "bg-emerald-100 text-emerald-800 border-emerald-200",
    gold: "bg-[#FDF8E8] text-[#8a6d16] border-gold-500",
    amber: "bg-amber-50 text-amber-800 border-amber-300",
    red: "bg-red-50 text-vermilion-500 border-red-200",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider", styles[color], className)}>
      {String(status || "—").replace(/_/g, " ")}
    </span>
  );
}

/* Table */
export function Table({ children, className }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-brown-800/10">
      <table className={cn("w-full text-sm", className)}>{children}</table>
    </div>
  );
}
export function THead({ children }) {
  return <thead className="bg-ivory-300 text-brown-800 sticky top-0">{children}</thead>;
}
export function TH({ children, right }) {
  return <th className={cn("px-3.5 py-2.5 font-semibold text-xs uppercase tracking-wide", right ? "text-right" : "text-left")}>{children}</th>;
}
export function TR({ children, className }) {
  return <tr className={cn("border-t border-brown-800/10 hover:bg-ivory-300/60", className)}>{children}</tr>;
}
export function TD({ children, right, className }) {
  return <td className={cn("px-3.5 py-2.5 text-brown-900", right ? "text-right tabular-nums" : "", className)}>{children}</td>;
}

/* Dialog */
export function Dialog({ open, onClose, title, children, footer, size = "md" }) {
  if (!open) return null;
  const w = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brown-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative w-full rounded-xl bg-white shadow-2xl animate-fade-up", w)}>
        <div className="flex items-center justify-between border-b border-brown-800/10 px-5 py-3.5">
          <h3 className="font-display text-2xl text-brown-900">{title}</h3>
          <button onClick={onClose} data-testid="dialog-close" className="text-brown-800/60 hover:text-brown-900">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer && <div className="border-t border-brown-800/10 px-5 py-3.5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* Tabs */
const TabsCtx = createContext(null);
export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-brown-800/10 mb-4">
      {tabs.map((t) => (
        <button
          key={t.value}
          data-testid={`tab-${t.value}`}
          onClick={() => onChange(t.value)}
          className={cn(
            "px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors",
            value === t.value ? "border-vermilion-500 text-vermilion-600" : "border-transparent text-brown-800/60 hover:text-brown-900"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin", className)} />;
}

export function Stat({ label, value, sub, accent }) {
  return (
    <Card className="overflow-hidden">
      <CardBody className="p-4">
        <div className="text-xs uppercase tracking-wider text-brown-800/50 font-semibold">{label}</div>
        <div className={cn("mt-1 text-2xl font-bold tabular-nums", accent || "text-brown-900")}>{value}</div>
        {sub && <div className="mt-0.5 text-xs text-brown-800/50">{sub}</div>}
      </CardBody>
    </Card>
  );
}
