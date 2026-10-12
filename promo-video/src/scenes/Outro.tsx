import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Wordmark } from "../Brand";
import { clamp, colors, ease, fontFamily } from "../theme";

// The three promises on Rentlio's sign-in page
const FEATURES = [
  { text: "Bills generate themselves on your billing day", icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" },
  { text: "Tenants upload proof; you verify in a tap", icon: "M20 6 9 17l-5-5" },
  { text: "Private by design: tenants see only their own records", icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" },
];

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Outro" style={{ fontFamily, alignItems: "center", justifyContent: "center", gap: 52 }}>
      <Interactive.Div
        name="Wordmark"
        style={{
          opacity: interpolate(frame, [0, 12], [0, 1], clamp),
          scale: interpolate(frame, [0, 24], [0.85, 1], {
            ...clamp,
            easing: Easing.spring({ damping: 15 }),
            output: "perceptual-scale",
          }),
        }}
      >
        <Wordmark size={132} />
      </Interactive.Div>

      <Interactive.Div
        name="Tagline"
        style={{
          fontSize: 76,
          fontWeight: 600,
          letterSpacing: "-0.035em",
          color: colors.text,
          opacity: interpolate(frame, [14, 30], [0, 1], { ...clamp, easing: ease }),
          translate: interpolate(frame, [14, 30], ["0px 30px", "0px 0px"], { ...clamp, easing: ease }),
        }}
      >
        Less chasing. <span style={{ color: colors.highlight }}>More collecting.</span>
      </Interactive.Div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {FEATURES.map((f, i) => (
          <div
            key={f.text}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 22,
              fontSize: 34,
              color: colors.muted,
              opacity: interpolate(frame, [34 + i * 6, 46 + i * 6], [0, 1], clamp),
              translate: interpolate(frame, [34 + i * 6, 50 + i * 6], ["-24px 0px", "0px 0px"], { ...clamp, easing: ease }),
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                backgroundColor: colors.inkRaised,
                border: `1.5px solid ${colors.border}`,
                display: "grid",
                placeItems: "center",
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={f.icon} />
              </svg>
            </div>
            {f.text}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
