import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Flower2, LogIn, ShieldCheck, Loader2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Button, Input, Label, Spinner } from "../../components/ui";
import { toast } from "sonner";

export default function Login() {
  const { user, loading, loginWithPassword } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/admin", { replace: true });
  }, [user, loading, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await loginWithPassword(loginId, password);
      toast.success("Signed in");
      navigate("/admin", { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-sky-50"><Spinner className="h-8 w-8 text-vermilion-500" /></div>;
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-sky-50 via-sun-50 to-sky-100 px-5 py-16">
      <Link
        to="/"
        data-testid="login-back-home"
        className="absolute left-5 top-5 inline-flex items-center gap-2 text-sm font-semibold text-brown-800/70 transition-colors hover:text-vermilion-500"
      >
        <ArrowLeft className="h-4 w-4" /> Back to website
      </Link>

      <div className="mx-auto w-full max-w-md rounded-2xl border border-sun-400/30 bg-white p-8 text-center shadow-card">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-vermilion-500 text-white">
          <Flower2 className="h-7 w-7" />
        </span>
        <h1 className="mt-4 font-display text-4xl text-brown-900">Committee Portal</h1>
        <p className="mt-1 text-sm text-brown-800/60">One 10 Events — EOC finance, subscriptions & operations</p>

        <form onSubmit={submit} className="mt-8 space-y-4 text-left">
          <div>
            <Label htmlFor="login-id" required>User ID</Label>
            <Input
              id="login-id"
              data-testid="committee-login-id"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="User ID"
              autoComplete="username"
            />
          </div>
          <div>
            <Label htmlFor="login-pw" required>Password</Label>
            <Input
              id="login-pw"
              type="password"
              data-testid="committee-login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <Button variant="primary" size="lg" className="w-full" type="submit" disabled={busy} data-testid="committee-login-btn">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
            Sign in
          </Button>
        </form>

        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-brown-800/45">
          <ShieldCheck className="h-4 w-4" /> Committee-only · role-based access
        </p>
        <Link to="/" className="mt-6 inline-block text-sm text-vermilion-500 hover:underline">
          Return to One 10 Events home
        </Link>
      </div>
    </div>
  );
}
