// Hash-routing helpers.
//
// Tend uses wouter's hash location. Two ways query params can arrive:
//  1. Internal <Link href="/path?x=1"> navigation: wouter's navigate() moves
//     the query into window.location.search (outside the hash).
//  2. External redirects (e.g. Stripe Checkout success_url): the query stays
//     inside the hash fragment, e.g. #/billing/success?church=4.
//
// useAppLocation strips any query from the path used for route matching, so
// case 2 still matches its route. pageQuery reads params from both places.
import { useHashLocation } from "wouter/use-hash-location";

// Path portion of a hash location, without any query string.
export function stripHashQuery(location: string): string {
  return location.split("?")[0] || "/";
}

export function useAppLocation(): ReturnType<typeof useHashLocation> {
  const [location, navigate] = useHashLocation();
  return [stripHashQuery(location), navigate] as ReturnType<typeof useHashLocation>;
}

export function pageQuery(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const fromSearch = window.location.search.replace(/^\?/, "");
  const fromHash = window.location.hash.split("?")[1] || "";
  const combined = [fromSearch, fromHash].filter(Boolean).join("&");
  return new URLSearchParams(combined);
}
