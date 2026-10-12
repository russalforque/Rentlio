import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { LogoMark } from "../Logo";
import { clamp, colors, ease, fontFamily } from "../theme";

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Intro"
      style={{ fontFamily, justifyContent: "center", alignItems: "center", gap: 48 }}
    >
      <Interactive.Div
        name="Logo"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 36,
          scale: interpolate(frame, [0, 24], [0.6, 1], {
            ...clamp,
            easing: Easing.spring({ damping: 14 }),
            output: "perceptual-scale",
          }),
          opacity: interpolate(frame, [0, 10], [0, 1], clamp),
        }}
      >
        <div
          style={{
            rotate: interpolate(frame, [0, 24], ["-90deg", "0deg"], { ...clamp, easing: ease }),
          }}
        >
          <LogoMark size={150} />
        </div>
        <div
          style={{
            fontSize: 150,
            fontWeight: 800,
            letterSpacing: -5,
            color: colors.text,
            clipPath: `inset(0 ${interpolate(frame, [8, 34], [100, 0], { ...clamp, easing: ease })}% 0 0)`,
          }}
        >
          Rentlio
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="Tagline"
        style={{
          fontSize: 48,
          fontWeight: 500,
          color: colors.muted,
          opacity: interpolate(frame, [30, 50], [0, 1], { ...clamp, easing: ease }),
          translate: interpolate(frame, [30, 50], ["0px 30px", "0px 0px"], { ...clamp, easing: ease }),
        }}
      >
        Rent, utilities & payments —{" "}
        <span style={{ color: colors.text, fontWeight: 700 }}>on autopilot.</span>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
