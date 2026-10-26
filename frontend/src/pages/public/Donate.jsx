import React from "react";
import { Navigate } from "react-router-dom";

/** Soft-redirect: donation heads for the open season live on /contribute. */
export default function Donate() {
  return <Navigate to="/contribute?mode=donate" replace />;
}
