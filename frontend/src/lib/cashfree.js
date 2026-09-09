const CASHFREE_SDK_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";
const SCRIPT_SELECTOR = 'script[data-one10-cashfree="checkout"]';

export function getCashfreeMode(fallback) {
  const fromEnv = (typeof process !== "undefined" && process.env?.REACT_APP_CASHFREE_MODE) || "";
  const value = String(fallback || fromEnv || "").trim().toLowerCase();
  if (value === "production" || value === "sandbox") return value;
  return "sandbox";
}

export function cashfreeOnlinePaymentsAvailable(cfgPayment) {
  const fromCfg = cfgPayment?.cashfree;
  if (fromCfg && typeof fromCfg.enabled === "boolean") return fromCfg.enabled;
  const enabled = (typeof process !== "undefined" && process.env?.REACT_APP_CASHFREE_ENABLED) || "";
  if (String(enabled).toLowerCase() === "false") return false;
  if (String(enabled).toLowerCase() === "true") return true;
  return false;
}

export function loadCashfreeCheckout(mode = getCashfreeMode()) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Cashfree Checkout requires a browser"));
  }

  const init = () => {
    if (typeof window.Cashfree !== "function") {
      throw new Error("Cashfree Checkout did not initialise");
    }
    return window.Cashfree({ mode: mode === "production" ? "production" : "sandbox" });
  };

  if (window.Cashfree) return Promise.resolve(init());

  const existing = document.querySelector(SCRIPT_SELECTOR);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => {
        try {
          resolve(init());
        } catch (error) {
          reject(error);
        }
      }, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Cashfree Checkout could not be loaded")),
        { once: true },
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CASHFREE_SDK_URL;
    script.async = true;
    script.dataset.one10Cashfree = "checkout";
    script.onload = () => {
      try {
        resolve(init());
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = () => reject(new Error("Cashfree Checkout could not be loaded"));
    document.head.appendChild(script);
  });
}

/** Start Cashfree hosted checkout for an existing payment session. */
export async function startCashfreeCheckout({ paymentSessionId, mode, redirectTarget = "_self" }) {
  const cashfree = await loadCashfreeCheckout(getCashfreeMode(mode));
  return cashfree.checkout({
    paymentSessionId,
    redirectTarget,
  });
}
