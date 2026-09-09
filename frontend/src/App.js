import React from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider } from "./context/AuthContext";
import AuthCallback from "./components/AuthCallback";
import AdminLayout, { RequireAuth } from "./components/AdminLayout";

import Home from "./pages/public/Home";
import Subscribe from "./pages/public/Subscribe";
import PaymentStatus from "./pages/public/PaymentStatus";
import ReceiptFind from "./pages/public/ReceiptFind";
import ReceiptVerify from "./pages/public/ReceiptVerify";
import Events from "./pages/public/Events";
import Nirghanto from "./pages/public/Nirghanto";
import Participate from "./pages/public/Participate";
import PublicReport from "./pages/public/PublicReport";
import Legal from "./pages/public/Legal";
import Sponsors from "./pages/public/Sponsors";
import Faq from "./pages/public/Faq";
import Donate from "./pages/public/Donate";
import UploadPaymentQr from "./pages/public/UploadPaymentQr";
import UploadPdf from "./pages/public/UploadPdf";
import Food from "./pages/public/Food";
import FoodPoll from "./pages/public/FoodPoll";

import Login from "./pages/admin/Login";
import Dashboard from "./pages/admin/Dashboard";
import Collection from "./pages/admin/Collection";
import Reconciliation from "./pages/admin/Reconciliation";
import Accounting from "./pages/admin/Accounting";
import Procurement from "./pages/admin/Procurement";
import Operations from "./pages/admin/Operations";
import Reports from "./pages/admin/Reports";
import AuditLog from "./pages/admin/AuditLog";
import Periods from "./pages/admin/Periods";
import Settings from "./pages/admin/Settings";

function AppRoutes() {
  const location = useLocation();
  // Process OAuth callback BEFORE any route/auth check (read from reactive hash)
  if (location.hash?.includes("session_id=")) return <AuthCallback />;

  return (
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
      <Route path="/upload-pdf" element={<UploadPdf />} />
      <Route path="/food-poll" element={<FoodPoll />} />
      <Route path="/food/vote" element={<FoodPoll />} />

      <Route path="/admin/login" element={<Login />} />
      <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="collection" element={<Collection />} />
        <Route path="reconciliation" element={<Reconciliation />} />
        <Route path="accounting" element={<Accounting />} />
        <Route path="procurement" element={<Procurement />} />
        <Route path="operations" element={<Operations />} />
        <Route path="reports" element={<Reports />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="periods" element={<Periods />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Home />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-center" richColors closeButton />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
