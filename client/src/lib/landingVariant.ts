// Landing page A/B test: assigns each visitor to variant "a" (current page)
// or "b" (restructured page) on first visit and remembers the choice.
// The variant is reported to GA4 so signup conversion can be compared.
export type LandingVariant = "a" | "b";

const STORAGE_KEY = "tend_landing_variant";

export function getLandingVariant(): LandingVariant {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "a" || saved === "b") return saved;
    const variant: LandingVariant = Math.random() < 0.5 ? "a" : "b";
    window.localStorage.setItem(STORAGE_KEY, variant);
    return variant;
  } catch {
    return "a";
  }
}
