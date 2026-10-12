import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { clamp, colors, ease, fontFamily } from "./theme";

/** Left-column scene text: a small label, a headline and an optional line under it. */
export const Caption: React.FC<{ label: string; title: React.ReactNode; body?: string; width?: number }> = ({
  label,
  title,
  body,
  width = 520,
}) => {
  const frame = useCurrentFrame();

  return (
    <div style={{ fontFamily, width, display: "flex", flexDirection: "column", gap: 22 }}>
      <Interactive.Div
        name="Label"
        style={{
          fontSize: 28,
          fontWeight: 500,
          color: colors.highlight,
          opacity: interpolate(frame, [4, 18], [0, 1], { ...clamp, easing: ease }),
          translate: interpolate(frame, [4, 18], ["0px 16px", "0px 0px"], { ...clamp, easing: ease }),
        }}
      >
        {label}
      </Interactive.Div>
      <Interactive.Div
        name="Title"
        style={{
          fontSize: 76,
          fontWeight: 600,
          lineHeight: 1.02,
          letterSpacing: "-0.035em",
          color: colors.text,
          opacity: interpolate(frame, [8, 26], [0, 1], { ...clamp, easing: ease }),
          translate: interpolate(frame, [8, 26], ["0px 34px", "0px 0px"], { ...clamp, easing: ease }),
        }}
      >
        {title}
      </Interactive.Div>
      {body ? (
        <Interactive.Div
          name="Body"
          style={{
            fontSize: 34,
            fontWeight: 400,
            lineHeight: 1.35,
            color: colors.muted,
            opacity: interpolate(frame, [16, 34], [0, 1], { ...clamp, easing: ease }),
            translate: interpolate(frame, [16, 34], ["0px 24px", "0px 0px"], { ...clamp, easing: ease }),
          }}
        >
          {body}
        </Interactive.Div>
      ) : null}
    </div>
  );
};

export const Amber: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ color: colors.highlight }}>{children}</span>
);
