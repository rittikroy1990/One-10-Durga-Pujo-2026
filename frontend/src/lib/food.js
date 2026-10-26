export const VEG_PROMISE =
  "All veg items are no-onion, no-garlic — cooked in a separate place with separate utensils, and served in a separate area.";

/** Mobile as typed, pasted or autofilled: keeps 10 digits, dropping a +91 / 0 prefix rather than the last digits. */
export function normalizeMobile(value) {
  let d = String(value || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 10);
}
