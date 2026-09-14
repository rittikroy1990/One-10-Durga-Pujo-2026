import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../lib/api";

const FootfallContext = createContext(null);

const SESSION_GUEST = "one10_footfall_guest";
const SESSION_WELCOME = "one10_footfall_welcome_shown";
const SESSION_MILESTONE = "one10_footfall_milestone_shown";

function readSession(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function FootfallProvider({ children }) {
  const [stats, setStats] = useState(null);
  const [visitNumber, setVisitNumber] = useState(() => {
    const v = readSession(SESSION_GUEST);
    return v ? Number(v) : null;
  });
  const [showWelcome, setShowWelcome] = useState(false);
  const [milestoneBanner, setMilestoneBanner] = useState(null); // { at, prize? } | number
  const [ready, setReady] = useState(false);

  const applyStats = useCallback((s) => {
    if (s) setStats(s);
  }, []);

  const refresh = useCallback(() => {
    api.get("/footfall")
      .then((r) => applyStats(r.data))
      .catch(() => {});
  }, [applyStats]);

  useEffect(() => {
    let cancelled = false;

    // Every full page load / visit counts (refresh or return = +1).
    // SPA route changes do not remount this provider, so in-app navigation does not inflate.
    (async () => {
      try {
        const r = await api.post("/footfall/ping");
        if (cancelled) return;
        const num = r.data.visit_number;
        writeSession(SESSION_GUEST, String(num));
        setVisitNumber(num);
        applyStats(r.data.stats);
        if (readSession(SESSION_WELCOME) !== "1") {
          setShowWelcome(true);
          writeSession(SESSION_WELCOME, "1");
        }
        const crossed = r.data.milestone_crossed;
        if (crossed && readSession(SESSION_MILESTONE) !== String(crossed)) {
          setMilestoneBanner({
            at: crossed,
            prize: r.data.milestone_crossed_prize || r.data.stats?.milestone_prize || null,
          });
          writeSession(SESSION_MILESTONE, String(crossed));
        }
      } catch {
        try {
          const r = await api.get("/footfall");
          if (!cancelled) applyStats(r.data);
        } catch {
          /* ignore */
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    const t = setInterval(() => {
      api.get("/footfall").then((r) => applyStats(r.data)).catch(() => {});
    }, 45000);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [applyStats]);

  const dismissWelcome = useCallback(() => setShowWelcome(false), []);
  const dismissMilestone = useCallback(() => setMilestoneBanner(null), []);

  const value = useMemo(
    () => ({
      stats,
      visitNumber,
      showWelcome,
      milestoneBanner,
      ready,
      refresh,
      dismissWelcome,
      dismissMilestone,
    }),
    [stats, visitNumber, showWelcome, milestoneBanner, ready, refresh, dismissWelcome, dismissMilestone],
  );

  return <FootfallContext.Provider value={value}>{children}</FootfallContext.Provider>;
}

export function useFootfall() {
  const ctx = useContext(FootfallContext);
  if (!ctx) {
    return {
      stats: null,
      visitNumber: null,
      showWelcome: false,
      milestoneBanner: null,
      ready: false,
      refresh: () => {},
      dismissWelcome: () => {},
      dismissMilestone: () => {},
    };
  }
  return ctx;
}
