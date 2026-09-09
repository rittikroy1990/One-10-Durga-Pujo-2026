import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/** Legacy /donate → combined Donate & Sponsorship hub. */
export default function Donate() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/sponsors#donate", { replace: true });
  }, [navigate]);
  return null;
}
