import React from "react";
import { Navigate } from "react-router-dom";

/** Soft-redirect: remainder-season subscribe lives on /contribute. */
export default function Subscribe() {
  return <Navigate to="/contribute?mode=subscribe" replace />;
}
