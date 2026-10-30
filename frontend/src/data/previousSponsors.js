/** One 10 Durgotsav 2026 partners (from the thank-you sponsors poster). */
const V = "20261027a"; // cache-bust when logo assets are refreshed
export const SPONSORS_2026 = [
  { id: "gopower-electech", name: "GoPower Electech", src: `/images/sponsors/2026/gopower-electech.png?v=${V}` },
  { id: "squad-synergy", name: "Squad Synergy", src: `/images/sponsors/2026/squad-synergy.png?v=${V}` },
  { id: "insure-efficient", name: "Insure Efficient", src: `/images/sponsors/2026/insure-efficient.png?v=${V}` },
  { id: "vikran-engineering", name: "Vikran Engineering", src: `/images/sponsors/2026/vikran-engineering.png?v=${V}` },
  { id: "times-of-india", name: "The Times of India", src: `/images/sponsors/2026/times-of-india.png?v=${V}` },
  { id: "universal-mep", name: "Universal MEP", src: `/images/sponsors/2026/universal-mep.png?v=${V}` },
  { id: "allcargo", name: "allcargo", src: `/images/sponsors/2026/allcargo.png?v=${V}` },
  { id: "roxx", name: "ROXX", src: `/images/sponsors/2026/roxx.png?v=${V}` },
  { id: "luxerra", name: "Luxerra", src: `/images/sponsors/2026/luxerra.png?v=${V}` },
  { id: "skipper-pipes", name: "Skipper Pipes", src: `/images/sponsors/2026/skipper-pipes.png?v=${V}` },
  { id: "skipper-furnishings", name: "Skipper Furnishings", src: `/images/sponsors/2026/skipper-furnishings.png?v=${V}` },
  { id: "britannia", name: "Britannia", src: `/images/sponsors/2026/britannia.png?v=${V}` },
  { id: "jeeneet-academy", name: "Jeeneet Academy", src: `/images/sponsors/2026/jeeneet-academy.png?v=${V}` },
  { id: "borondalaa", name: "Borondalaa", src: `/images/sponsors/2026/borondalaa.png?v=${V}` },
  { id: "zee-bangla", name: "Zee Bangla", src: `/images/sponsors/2026/zee-bangla.png?v=${V}` },
];

/** Previous One 10 Durgotsav partners (logo strip on /sponsors). */
export const PREVIOUS_SPONSORS = [
  { id: "bank-of-india", name: "Bank of India", src: "/images/sponsors/previous/bank-of-india.png" },
  { id: "icici-bank", name: "ICICI Bank", src: "/images/sponsors/previous/icici-bank.png" },
  { id: "sbi-home-loans", name: "SBI Home Loans", src: "/images/sponsors/previous/sbi-home-loans.png" },
  { id: "britannia", name: "Britannia", src: "/images/sponsors/previous/britannia.png" },
  { id: "charnock-hospitals", name: "Charnock Hospitals", src: "/images/sponsors/previous/charnock-hospitals.png" },
  { id: "renova-health-care", name: "Renova Health Care", src: "/images/sponsors/previous/renova-health-care.png" },
  { id: "albus-hospitality", name: "Albus Hospitality", src: "/images/sponsors/previous/albus-hospitality.png" },
  { id: "skipper-pipes", name: "Skipper Pipes", src: "/images/sponsors/previous/skipper-pipes.png" },
  { id: "skipper-furnishings", name: "Skipper Furnishings", src: "/images/sponsors/previous/skipper-furnishings.png" },
  { id: "rajlaxmi-home-furnishing", name: "Rajlaxmi Home Furnishing", src: "/images/sponsors/previous/rajlaxmi-home-furnishing.png" },
  { id: "archway-design-studio", name: "Archway Design Studio", src: "/images/sponsors/previous/archway-design-studio.png" },
  { id: "the-green-studio", name: "The Green Studio", src: "/images/sponsors/previous/the-green-studio.png" },
  { id: "dhanuka-dhunseri-tt", name: "Dhanuka Dhunseri TT", src: "/images/sponsors/previous/dhanuka-dhunseri-tt.png" },
  { id: "vikran-engineering", name: "Vikran Engineering", src: "/images/sponsors/previous/vikran-engineering.png" },
  { id: "tu-rain", name: "TU Rain", src: "/images/sponsors/previous/tu-rain.png" },
  { id: "dr-anuraag-jaiswal", name: "Dr Anuraag Jaiswal", src: "/images/sponsors/previous/dr-anuraag-jaiswal.png" },
];

export const SPONSORSHIP_DECK_PAGES = Array.from({ length: 14 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return {
    id: `p-${n}`,
    src: `/sponsorship/pages-full/p-${n}.jpg`,
    alt: `Sponsorship proposal page ${i + 1}`,
  };
});

export const SPONSORSHIP_DECK_PDF =
  "/sponsorship/One10-Durga-Puja-2026-Sponsorship-Proposal.pdf";
