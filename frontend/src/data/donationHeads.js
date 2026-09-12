/** One 10 Durgotsav 2026 — Donation Heads (from committee flyer).
 * Amounts in rupees. Ordered chronologically for readability.
 */
export const DONATION_HEADS = [
  {
    id: "idol-decor",
    title: "Idol & Decorations",
    subtitle: "Murti, sajja & mandap",
    accent: "#7A1F2B",
    soft: "#F6E8E4",
    items: [
      { id: "idol-carriage", label: "Durga Idol Carriage & Mutia", amount: 5000 },
      { id: "idol-garland", label: "Durga Puja Idol Garland", amount: 10000 },
      { id: "laxmi-idol", label: "Laxmi Idol", amount: 10000 },
      { id: "durga-idol", label: "Durga Idol", amount: 65000, closed: true, closedLabel: "Done" },
      { id: "sajja-astra", label: "Durga Sajja & Astra", amount: 5000 },
      { id: "purohit", label: "Puja Purohit", amount: 10000 },
      { id: "mandap-sajja", label: "Durga Puja Mandap Sajja", amount: 15000 },
    ],
  },
  {
    id: "shasti",
    title: "Shasti Puja",
    subtitle: "Bodhon day offerings",
    accent: "#0F6B6B",
    soft: "#E4F4F3",
    items: [
      { id: "shasti-flower", label: "Shasti Puja Flowers", amount: 5000 },
      { id: "shasti-fruits", label: "Shasti Puja Fruits", amount: 5000 },
    ],
  },
  {
    id: "saptami",
    title: "Saptami Puja",
    subtitle: "Seventh day offerings",
    accent: "#5B2C6F",
    soft: "#F1E8F6",
    items: [
      { id: "saptami-bhog", label: "Saptami Bhog", amount: 5000 },
      { id: "saptami-flowers", label: "Saptami Flowers", amount: 5000 },
      { id: "saptami-fruits", label: "Saptami Fruits", amount: 5000 },
      { id: "saptami-sweets", label: "Saptami Sweets", amount: 5000 },
    ],
  },
  {
    id: "ashtami",
    title: "Ashtami Puja",
    subtitle: "Eighth day offerings",
    accent: "#B8860B",
    soft: "#FBF3DE",
    items: [
      { id: "ashtami-bhog", label: "Ashtami Bhog", amount: 5000 },
      { id: "ashtami-flowers", label: "Ashtami Flowers", amount: 5000 },
      { id: "ashtami-fruits", label: "Ashtami Fruits", amount: 5000 },
      { id: "ashtami-sweets", label: "Ashtami Sweets", amount: 5000 },
    ],
  },
  {
    id: "sandhi",
    title: "Sandhi Puja Rituals",
    subtitle: "The sacred junction hour",
    accent: "#1B3A6B",
    soft: "#E6ECF6",
    items: [
      { id: "kala-bou", label: "Kala Bou Snan", amount: 2000 },
      { id: "sandhi-fruits", label: "Sandhi Puja Fruits", amount: 5000 },
      { id: "sandhi-flower", label: "Sandhi Puja Flowers", amount: 5000 },
      { id: "sandhi-sweets", label: "Sandhi Puja Sweets", amount: 5000 },
      { id: "sandhi-bhog", label: "Sandhi Puja Bhog", amount: 5000 },
    ],
  },
  {
    id: "navami",
    title: "Navami Puja",
    subtitle: "Ninth day offerings",
    accent: "#145A4A",
    soft: "#E3F2ED",
    items: [
      { id: "navami-bhog", label: "Navami Bhog", amount: 5000 },
      { id: "navami-flowers", label: "Navami Flowers", amount: 5000 },
      { id: "navami-fruits", label: "Navami Fruits", amount: 5000 },
      { id: "navami-sweets", label: "Navami Sweets", amount: 5000 },
    ],
  },
  {
    id: "dashami",
    title: "Dashami Puja",
    subtitle: "Bijoya & immersion",
    accent: "#C0392B",
    soft: "#F9E8E6",
    items: [
      { id: "dashami-bhog", label: "Dashami Bhog", amount: 5000 },
      { id: "dashami-flowers", label: "Dashami Flowers", amount: 5000 },
      { id: "dashami-fruits", label: "Dashami Fruits", amount: 5000 },
      { id: "dashami-sweets", label: "Dashami Sweets", amount: 5000 },
      { id: "durga-immersion", label: "Durga Idol Immersion", amount: 10000 },
    ],
  },
  {
    id: "lakshmi",
    title: "Lakshmi Puja",
    subtitle: "After Bijoya",
    accent: "#A61B4B",
    soft: "#F9E6EF",
    items: [
      { id: "lakshmi-flower", label: "Lakshmi Puja Flowers", amount: 5000 },
      { id: "lakshmi-sweets", label: "Lakshmi Puja Sweets", amount: 10000 },
      { id: "lakshmi-fruits", label: "Lakshmi Puja Fruits", amount: 5000 },
      { id: "lakshmi-bhog", label: "Lakshmi Puja Bhog", amount: 10000 },
      { id: "lakshmi-immersion", label: "Lakshmi Idol Immersion", amount: 5000 },
    ],
  },
];

export function formatInr(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

export function findDonationItem(itemId) {
  for (const cat of DONATION_HEADS) {
    const item = cat.items.find((i) => i.id === itemId);
    if (item) return { ...item, category: cat.title };
  }
  return null;
}
