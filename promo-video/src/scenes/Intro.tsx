import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Wordmark } from "../Brand";
import { clamp, colors, ease, fontFamily } from "../theme";

// The lit-window building from Rentlio's sign-in panel (src/layouts/auth-layout.tsx)
const LIT = ["1011011", "0111011", "0101110", "1101110"];
const ORDER = [5, 17, 2, 22, 9, 13, 0, 26, 7, 19, 11, 3, 24, 15, 1, 20, 8, 27, 12, 4, 23, 16, 6, 18, 10, 25, 14, 21];

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const roofLength = 560;

  return (
    <AbsoluteFill name="Intro" style={{ fontFamily, alignItems: "center", justifyContent: "center", gap: 40 }}>
      <Interactive.Div
        name="Building"
        style={{
          scale: interpolate(frame, [0, 30], [0.9, 1], { ...clamp, easing: ease, output: "perceptual-scale" }),
          opacity: interpolate(frame, [0, 10], [0, 1], clamp),
        }}
      >
        <svg width={560} height={474} viewBox="90 240 520 440" fill="none">
          <path
            d="M100 365 350 250 600 365"
            stroke="#5b5b63"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={roofLength}
            strokeDashoffset={interpolate(frame, [0, 24], [roofLength, 0], { ...clamp, easing: ease })}
          />
          <rect
            x={133}
            y={360}
            width={435}
            height={310}
            rx={14}
            fill="#1c1c1f"
            stroke="#3a3a40"
            strokeWidth={3}
            opacity={interpolate(frame, [6, 20], [0, 1], clamp)}
          />
          {LIT.flatMap((row, r) =>
            row.split("").map((lit, c) => {
              const i = r * 7 + c;
              const appear = 10 + i * 0.7;
              const light = 26 + ORDER.indexOf(i) * 1.1;
              return (
                <rect
                  key={i}
                  x={163 + c * 56}
                  y={388 + r * 65}
                  width={37}
                  height={42}
                  rx={5}
                  fill={lit === "1" && frame >= light ? colors.highlight : "#2e2e33"}
                  opacity={interpolate(frame, [appear, appear + 6], [0, 1], clamp)}
                  style={{
                    filter:
                      lit === "1" && frame >= light
                        ? `drop-shadow(0 0 ${interpolate(frame, [light, light + 8], [14, 4], clamp)}px rgba(242,181,43,0.7))`
                        : undefined,
                  }}
                />
              );
            }),
          )}
          <rect x={330} y={632} width={40} height={38} rx={3} fill="#4a4a52" opacity={interpolate(frame, [18, 26], [0, 1], clamp)} />
        </svg>
      </Interactive.Div>

      <Interactive.Div
        name="Wordmark"
        style={{
          opacity: interpolate(frame, [38, 52], [0, 1], clamp),
          translate: interpolate(frame, [38, 58], ["0px 30px", "0px 0px"], { ...clamp, easing: ease }),
          scale: interpolate(frame, [38, 58], [0.9, 1], {
            ...clamp,
            easing: Easing.spring({ damping: 16 }),
            output: "perceptual-scale",
          }),
        }}
      >
        <Wordmark size={104} />
      </Interactive.Div>

      <Interactive.Div
        name="Tagline"
        style={{
          fontSize: 50,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          color: colors.muted,
          opacity: interpolate(frame, [52, 70], [0, 1], { ...clamp, easing: ease }),
          translate: interpolate(frame, [52, 70], ["0px 24px", "0px 0px"], { ...clamp, easing: ease }),
        }}
      >
        Every room, every bill, <span style={{ color: colors.text }}>in one calm place.</span>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
