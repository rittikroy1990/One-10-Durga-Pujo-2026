import React from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Flower2, LogIn, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Button, Spinner } from "../../components/ui";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/admin", { replace: true });
  }, [user, loading, navigate]);

  const login = () => {
    const redirectUrl = window.location.origin + "/admin";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-brown-800"><Spinner className="h-8 w-8 text-gold-500" /></div>;
  }

  return (
    <div className="grid min-h-screen place-items-center bg-brown-800 alpona-bg grain px-5">
      <div className="w-full max-w-md rounded-2xl border border-gold-500/30 bg-brown-700/70 p-8 text-center backdrop-blur">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-vermilion-500 text-ivory-100">
          <Flower2 className="h-7 w-7" />
        </span>
        <h1 className="mt-4 font-display text-4xl text-gradient-gold">Committee Portal</h1>
        <p className="mt-1 text-sm text-ivory-100/60">One10 Durgotsav 2026 — EOC finance & operations</p>
        <Button variant="gold" size="lg" className="mt-8 w-full" onClick={login} data-testid="google-login-btn">
          <LogIn className="h-5 w-5" /> Sign in with Google
        </Button>
        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-ivory-100/40">
          <ShieldCheck className="h-4 w-4" /> Role-based access is enforced by the backend.
        </p>
      </div>
    </div>
  );
}
