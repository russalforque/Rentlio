import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Card } from "../Card";
import { Accent, Headline } from "../Headline";
import { clamp, colors, ease, fontFamily, peso } from "../theme";

const months = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
const billed = [182, 186, 184, 190, 193, 195, 198, 201, 203, 204, 206, 208];
const collected = [168, 175, 179, 184, 186, 191, 193, 197, 200, 201, 203, 185];
const minValue = 120;
const maxValue = 215;
const barHeight = (v: number) => ((v - minValue) / (maxValue - minValue)) * 100;

const kpis = [
  { label: "Collected this month", value: 185400, format: peso, color: colors.emerald },
  { label: "Outstanding", value: 23150, format: peso, color: colors.amber },
  { label: "Occupancy", value: 86, format: (n: number) => `${Math.round(n)}%`, color: colors.indigo },
];

export const Dashboard: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Dashboard" style={{ fontFamily, padding: "100px 160px", gap: 44 }}>
      <Headline
        eyebrow="Dashboard & reports"
        title={
          <>
            Know where <Accent>every peso</Accent> is.
          </>
        }
      />

      <div style={{ display: "flex", gap: 32 }}>
        {kpis.map((k, i) => (
          <div
            key={k.label}
            style={{
              flex: 1,
              opacity: interpolate(frame, [14 + i * 6, 28 + i * 6], [0, 1], clamp),
              translate: interpolate(frame, [14 + i * 6, 34 + i * 6], ["0px 40px", "0px 0px"], {
                ...clamp,
                easing: ease,
              }),
            }}
          >
            <Card style={{ padding: "30px 36px", borderRadius: 28 }}>
              <div style={{ fontSize: 26, color: colors.muted, fontWeight: 600 }}>{k.label}</div>
              <div
                style={{
                  fontSize: 64,
                  fontWeight: 800,
                  color: k.color,
                  fontVariantNumeric: "tabular-nums",
                  marginTop: 6,
                }}
              >
                {k.format(interpolate(frame, [20 + i * 6, 60 + i * 6], [0, k.value], { ...clamp, easing: ease }))}
              </div>
            </Card>
          </div>
        ))}
      </div>

      <Card
        style={{
          flex: 1,
          padding: "32px 40px 24px",
          display: "flex",
          flexDirection: "column",
          opacity: interpolate(frame, [30, 44], [0, 1], clamp),
        }}
      >
        <div style={{ display: "flex", gap: 36, fontSize: 24, fontWeight: 700, color: colors.muted }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: "#475569" }} /> Billed
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: colors.indigo }} /> Collected
          </span>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 28, marginTop: 20 }}>
          {months.map((m, i) => {
            const grow = interpolate(frame, [36 + i * 3, 66 + i * 3], [0, 1], { ...clamp, easing: ease });
            return (
              <div key={m} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end", gap: 6 }}>
                  <div
                    style={{
                      flex: 1,
                      height: `${barHeight(billed[i]) * grow}%`,
                      backgroundColor: "#475569",
                      borderRadius: "8px 8px 0 0",
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      height: `${barHeight(collected[i]) * grow}%`,
                      background: `linear-gradient(180deg, ${colors.violet}, ${colors.indigo})`,
                      borderRadius: "8px 8px 0 0",
                    }}
                  />
                </div>
                <div style={{ fontSize: 22, fontWeight: 600, color: colors.muted, marginTop: 12 }}>{m}</div>
              </div>
            );
          })}
        </div>
      </Card>
    </AbsoluteFill>
  );
};
