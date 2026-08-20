import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "./ui";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    const hash = window.location.hash || "";
    const match = hash.match(/session_id=([^&]+)/);
    const sessionId = match ? decodeURIComponent(match[1]) : null;
    (async () => {
      if (!sessionId) {
        navigate("/admin/login");
        return;
      }
      try {
        const r = await api.post("/auth/session", { session_id: sessionId });
        setUser(r.data.user);
        window.history.replaceState(null, "", "/admin");
        navigate("/admin", { replace: true });
      } catch (e) {
        navigate("/admin/login?error=1", { replace: true });
      }
    })();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brown-800 text-ivory-100 gap-4">
      <Spinner className="h-8 w-8 text-gold-500" />
      <p className="font-display text-2xl">Signing you in…</p>
    </div>
  );
}
