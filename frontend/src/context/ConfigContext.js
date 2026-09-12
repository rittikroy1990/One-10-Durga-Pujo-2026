import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../lib/api";

const ConfigContext = createContext({
  cfg: null,
  loading: true,
  refresh: () => {},
});

export function ConfigProvider({ children }) {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = React.useCallback(() => {
    setLoading(true);
    api
      .get("/config")
      .then((r) => setCfg(r.data))
      .catch(() => setCfg(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ cfg, loading, refresh }), [cfg, loading, refresh]);
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  return useContext(ConfigContext);
}
