import { colors, fontFamily } from "./theme";

/** Rentlio's logo (src/components/app/brand.tsx): a roofline over a lit window. */
export const BrandMark: React.FC<{ size: number; inverted?: boolean }> = ({ size, inverted = true }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.22,
      backgroundColor: inverted ? colors.text : colors.ink,
      color: inverted ? colors.ink : colors.text,
      display: "grid",
      placeItems: "center",
      flexShrink: 0,
    }}
  >
    <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} fill="none">
      <path d="M3.5 11 12 4l8.5 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9.5h12V10" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <rect x="9.6" y="12.4" width="4.8" height="4.8" rx="1" fill={colors.highlight} />
    </svg>
  </div>
);

export const Wordmark: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.32 }}>
    <BrandMark size={size} />
    <span style={{ fontFamily, fontSize: size * 0.82, fontWeight: 600, letterSpacing: "-0.035em", color: colors.text }}>
      Rentlio
    </span>
  </div>
);
