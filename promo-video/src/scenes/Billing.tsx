import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Card, Pill } from "../Card";
import { Accent, Headline } from "../Headline";
import { clamp, colors, ease, fontFamily, peso } from "../theme";

const lines = [
  { label: "Monthly rent", detail: "Room 204", amount: 6500 },
  { label: "Electricity", detail: "142 kWh × ₱12", amount: 1704 },
  { label: "Water", detail: "Flat rate", amount: 350 },
];
const total = lines.reduce((sum, l) => sum + l.amount, 0);

export const Billing: React.FC = () => {
  const frame = useCurrentFrame();
  const lineStart = (i: number) => 34 + i * 14;
  const runningTotal = lines.reduce(
    (sum, l, i) =>
      sum + l.amount * interpolate(frame, [lineStart(i), lineStart(i) + 16], [0, 1], { ...clamp, easing: ease }),
    0,
  );

  return (
    <AbsoluteFill
      name="Billing"
      style={{
        fontFamily,
        padding: "0 160px",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ width: 760 }}>
        <Headline
          eyebrow="Automatic billing"
          title={
            <>
              Bills that <Accent>write themselves.</Accent>
            </>
          }
          subtitle="Generated on billing day for every occupied room. Meter readings update them instantly."
        />
      </div>

      <div
        style={{
          position: "relative",
          opacity: interpolate(frame, [10, 26], [0, 1], clamp),
          translate: interpolate(frame, [10, 34], ["120px 0px", "0px 0px"], { ...clamp, easing: ease }),
          rotate: interpolate(frame, [10, 34], ["4deg", "0deg"], { ...clamp, easing: ease }),
        }}
      >
        <Card style={{ width: 760, padding: 52 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 26, color: colors.muted, fontWeight: 600 }}>October 2026</div>
              <div style={{ fontSize: 46, color: colors.text, fontWeight: 800 }}>Room 204</div>
            </div>
            <Pill color={colors.amber}>Due Oct 10</Pill>
          </div>

          <div style={{ height: 2, backgroundColor: colors.panelBorder, margin: "36px 0 12px" }} />

          {lines.map((l, i) => (
            <div
              key={l.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "20px 0",
                opacity: interpolate(frame, [lineStart(i), lineStart(i) + 12], [0, 1], clamp),
                translate: interpolate(frame, [lineStart(i), lineStart(i) + 16], ["-40px 0px", "0px 0px"], {
                  ...clamp,
                  easing: ease,
                }),
              }}
            >
              <div>
                <div style={{ fontSize: 34, color: colors.text, fontWeight: 700 }}>{l.label}</div>
                <div style={{ fontSize: 24, color: colors.muted, fontWeight: 500 }}>{l.detail}</div>
              </div>
              <div style={{ fontSize: 34, color: colors.text, fontWeight: 700 }}>{peso(l.amount)}</div>
            </div>
          ))}

          <div style={{ height: 2, backgroundColor: colors.panelBorder, margin: "12px 0 28px" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 32, color: colors.muted, fontWeight: 700 }}>Total due</div>
            <div
              style={{
                fontSize: 72,
                fontWeight: 800,
                color: colors.text,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {peso(Math.min(runningTotal, total))}
            </div>
          </div>
        </Card>

        <div
          style={{
            position: "absolute",
            top: -40,
            left: -60,
            scale: interpolate(frame, [86, 104], [0, 1], {
              ...clamp,
              easing: Easing.spring({ damping: 10 }),
              output: "perceptual-scale",
            }),
          }}
        >
          <Pill
            color={colors.emerald}
            style={{ backgroundColor: "#062B22", fontSize: 28, padding: "16px 28px", border: `2px solid ${colors.emerald}` }}
          >
            Auto-generated on day 1
          </Pill>
        </div>
      </div>
    </AbsoluteFill>
  );
};
