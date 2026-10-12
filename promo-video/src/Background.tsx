import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { colors } from "./theme";

/** The ink canvas from Rentlio's sign-in panel: a dot grid with a soft violet glow. */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Background" style={{ backgroundColor: colors.ink, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.09) 1.2px, transparent 1.2px)",
          backgroundSize: "34px 34px",
          backgroundPosition: `0px ${interpolate(frame, [0, 1800], [0, 136])}px`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 1400,
          height: 1400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124, 88, 220, 0.38) 0%, transparent 62%)",
          right: -520,
          bottom: -720,
          translate: `${interpolate(frame, [0, 1800], [0, -420])}px ${interpolate(frame, [0, 1800], [0, -80])}px`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(242, 181, 43, 0.10) 0%, transparent 65%)",
          left: -360,
          top: -420,
        }}
      />
    </AbsoluteFill>
  );
};
