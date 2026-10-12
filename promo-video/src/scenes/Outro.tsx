import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { LogoMark } from "../Logo";
import { clamp, colors, ease, fontFamily } from "../theme";

const features = ["Automatic billing", "Proof-of-payment", "Tenant portal", "Reports & CSV", "Secure by default"];

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Outro" style={{ fontFamily, justifyContent: "center", alignItems: "center", gap: 56 }}>
      <Interactive.Div
        name="Logo"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 32,
          scale: interpolate(frame, [0, 22], [0.7, 1], {
            ...clamp,
            easing: Easing.spring({ damping: 14 }),
            output: "perceptual-scale",
          }),
          opacity: interpolate(frame, [0, 10], [0, 1], clamp),
        }}
      >
        <LogoMark size={130} />
        <div style={{ fontSize: 130, fontWeight: 800, letterSpacing: -4, color: colors.text }}>Rentlio</div>
      </Interactive.Div>

      <Interactive.Div
        name="Tagline"
        style={{
          fontSize: 60,
          fontWeight: 700,
          color: colors.text,
          opacity: interpolate(frame, [16, 32], [0, 1], { ...clamp, easing: ease }),
          translate: interpolate(frame, [16, 32], ["0px 30px", "0px 0px"], { ...clamp, easing: ease }),
        }}
      >
        Less chasing. <span style={{ color: colors.emerald }}>More collecting.</span>
      </Interactive.Div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "center", maxWidth: 1500 }}>
        {features.map((f, i) => (
          <div
            key={f}
            style={{
              padding: "16px 30px",
              borderRadius: 999,
              border: `2px solid ${colors.panelBorder}`,
              backgroundColor: colors.panel,
              color: colors.muted,
              fontSize: 28,
              fontWeight: 600,
              opacity: interpolate(frame, [30 + i * 4, 42 + i * 4], [0, 1], clamp),
              translate: interpolate(frame, [30 + i * 4, 46 + i * 4], ["0px 24px", "0px 0px"], {
                ...clamp,
                easing: ease,
              }),
            }}
          >
            {f}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
