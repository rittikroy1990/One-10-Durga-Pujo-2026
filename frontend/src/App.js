import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider } from "./context/AuthContext";
import { ConfigProvider } from "./context/ConfigContext";
import AuthCallback from "./components/AuthCallback";
import AdminLayout, { RequireAuth } from "./components/AdminLayout";

import Home from "./pages/public/Home";

const Subscribe = lazy(() => import("./pages/public/Subscribe"));
const PaymentStatus = lazy(() => import("./pages/public/PaymentStatus"));
const ReceiptFind = lazy(() => import("./pages/public/ReceiptFind"));
const ReceiptVerify = lazy(() => import("./pages/public/ReceiptVerify"));
const Events = lazy(() => import("./pages/public/Events"));
const Nirghanto = lazy(() => import("./pages/public/Nirghanto"));
const Participate = lazy(() => import("./pages/public/Participate"));
const PublicReport = lazy(() => import("./pages/public/PublicReport"));
const Legal = lazy(() => import("./pages/public/Legal"));
const Sponsors = lazy(() => import("./pages/public/Sponsors"));
const Faq = lazy(() => import("./pages/public/Faq"));
const Donate = lazy(() => import("./pages/public/Donate"));
const Food = lazy(() => import("./pages/public/Food"));
const UploadPaymentQr = lazy(() => import("./pages/public/UploadPaymentQr"));

const Login = lazy(() => import("./pages/admin/Login"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const Collection = lazy(() => import("./pages/admin/Collection"));
const FoodAdmin = lazy(() => import("./pages/admin/FoodAdmin"));
const Reconciliation = lazy(() => import("./pages/admin/Reconciliation"));
const Accounting = lazy(() => import("./pages/admin/Accounting"));
const Procurement = lazy(() => import("./pages/admin/Procurement"));
const Operations = lazy(() => import("./pages/admin/Operations"));
const Reports = lazy(() => import("./pages/admin/Reports"));
const Periods = lazy(() => import("./pages/admin/Periods"));
const Settings = lazy(() => import("./pages/admin/Settings"));

function RouteFallback() {
  return (
    <div className="grid min-h-[40vh] place-items-center bg-sky-50 text-sm text-brown-800/60">
      Loading…
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  // Process OAuth callback BEFORE any route/auth check (read from reactive hash)
  if (location.hash?.includes("session_id=")) return <AuthCallback />;

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/subscribe" element={<Subscribe />} />
        <Route path="/donate" element={<Donate />} />
        <Route path="/food" element={<Food />} />
        <Route path="/payment/status" element={<PaymentStatus />} />
        <Route path="/receipt/find" element={<ReceiptFind />} />
        <Route path="/receipt/verify/:token" element={<ReceiptVerify />} />
        <Route path="/events" element={<Events />} />
        <Route path="/nirghanto" element={<Nirghanto />} />
        <Route path="/participate" element={<Participate />} />
        <Route path="/sponsors" element={<Sponsors />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/transparency" element={<PublicReport />} />
        <Route path="/privacy" element={<Legal type="privacy" />} />
        <Route path="/terms" element={<Legal type="terms" />} />
        <Route path="/contact" element={<Legal type="contact" />} />
        <Route path="/upload-qr" element={<UploadPaymentQr />} />

        <Route path="/admin/login" element={<Login />} />
        <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="collection" element={<Collection />} />
          <Route path="food" element={<FoodAdmin />} />
          <Route path="dashboard" element={<Navigate to="/admin" replace />} />
          <Route path="reconciliation" element={<Reconciliation />} />
          <Route path="accounting" element={<Accounting />} />
          <Route path="procurement" element={<Procurement />} />
          <Route path="operations" element={<Operations />} />
          <Route path="reports" element={<Reports />} />
          <Route path="audit" element={<Navigate to="/admin/collection" replace />} />
          <Route path="periods" element={<Periods />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<Home />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ConfigProvider>
          <Toaster position="top-center" richColors closeButton />
          <AppRoutes />
        </ConfigProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
