interface LogoProps { size?: number; className?: string; showWordmark?: boolean }

/** Open enclosure and a person: a place to be heard, with room to come in. */
export function Logo({ size = 32, className = "", showWordmark = false }: LogoProps) {
  return (
    <span className={`tend-logo ${className}`}>
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" role="img" aria-label={showWordmark ? undefined : "Tend"} aria-hidden={showWordmark || undefined}>
        <path d="M31 9A15 15 0 1 0 31 31" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="20" cy="15" r="3.3" fill="currentColor" />
        <path d="M20 23v5m-6-7 6 2 6-2" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {showWordmark && <span className="tend-wordmark">tend</span>}
    </span>
  );
}
