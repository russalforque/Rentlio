import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { clamp, colors, ease } from "./theme";

export const Headline: React.FC<{
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: string;
  align?: "left" | "center";
  delay?: number;
}> = ({ eyebrow, title, subtitle, align = "left", delay = 0 }) => {
  const frame = useCurrentFrame() - delay;

  return (
    <div style={{ textAlign: align, display: "flex", flexDirection: "column", gap: 20 }}>
      <Interactive.Div
        name="Eyebrow"
        style={{
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: colors.indigo,
          opacity: interpolate(frame, [0, 15], [0, 1], { ...clamp, easing: ease }),
          translate: interpolate(frame, [0, 15], ["0px 20px", "0px 0px"], { ...clamp, easing: ease }),
        }}
      >
        {eyebrow}
      </Interactive.Div>
      <Interactive.Div
        name="Title"
        style={{
          fontSize: 92,
          fontWeight: 800,
          lineHeight: 1.04,
          letterSpacing: -2.5,
          color: colors.text,
          opacity: interpolate(frame, [4, 22], [0, 1], { ...clamp, easing: ease }),
          translate: interpolate(frame, [4, 22], ["0px 40px", "0px 0px"], { ...clamp, easing: ease }),
        }}
      >
        {title}
      </Interactive.Div>
      {subtitle ? (
        <Interactive.Div
          name="Subtitle"
          style={{
            fontSize: 36,
            fontWeight: 500,
            lineHeight: 1.35,
            color: colors.muted,
            maxWidth: align === "center" ? 1200 : 700,
            alignSelf: align === "center" ? "center" : "flex-start",
            opacity: interpolate(frame, [12, 30], [0, 1], { ...clamp, easing: ease }),
            translate: interpolate(frame, [12, 30], ["0px 30px", "0px 0px"], { ...clamp, easing: ease }),
          }}
        >
          {subtitle}
        </Interactive.Div>
      ) : null}
    </div>
  );
};

export const Accent: React.FC<{ children: React.ReactNode; color?: string }> = ({
  children,
  color = colors.indigo,
}) => (
  <span
    style={{
      background: `linear-gradient(90deg, ${color}, ${colors.violet})`,
      WebkitBackgroundClip: "text",
      color: "transparent",
    }}
  >
    {children}
  </span>
);
