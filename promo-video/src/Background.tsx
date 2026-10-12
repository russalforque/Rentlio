import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { colors } from "./theme";

export const Background: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Background" style={{ backgroundColor: colors.bg, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          backgroundPosition: `0px ${interpolate(frame, [0, 900], [0, 160])}px`,
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.indigo}55 0%, transparent 65%)`,
          left: -250,
          top: -350,
          translate: `${interpolate(frame, [0, 900], [0, 300])}px ${interpolate(frame, [0, 900], [0, 120])}px`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.emerald}33 0%, transparent 65%)`,
          right: -250,
          bottom: -350,
          translate: `${interpolate(frame, [0, 900], [0, -260])}px ${interpolate(frame, [0, 900], [0, -80])}px`,
        }}
      />
    </AbsoluteFill>
  );
};
