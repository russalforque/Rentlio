import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Accent, Headline } from "../Headline";
import { clamp, colors, ease, fontFamily } from "../theme";

const rooms = [
  ...Array.from({ length: 14 }, (_, i) => 101 + i),
  ...Array.from({ length: 14 }, (_, i) => 201 + i),
];
const vacant = new Set([107, 112, 209]);
const maintenance = new Set([205]);

const statusColor = (room: number) =>
  maintenance.has(room) ? colors.amber : vacant.has(room) ? colors.slate : colors.indigo;

export const Rooms: React.FC = () => {
  const frame = useCurrentFrame();

  const stats = [
    { label: "Occupied", value: 24, color: colors.indigo },
    { label: "Vacant", value: 3, color: "#64748B" },
    { label: "Maintenance", value: 1, color: colors.amber },
  ];

  return (
    <AbsoluteFill
      name="Rooms"
      style={{ fontFamily, padding: "140px 160px", justifyContent: "space-between" }}
    >
      <Headline
        eyebrow="Rooms & tenants"
        title={
          <>
            28 rooms. <Accent>One dashboard.</Accent>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(14, 1fr)", gap: 14 }}>
        {rooms.map((room, i) => {
          const start = 14 + (i % 14) * 1.6 + Math.floor(i / 14) * 6;
          const color = statusColor(room);
          return (
            <div
              key={room}
              style={{
                height: 150,
                borderRadius: 20,
                backgroundColor: `${color}${color === colors.slate ? "" : "2E"}`,
                border: `2px solid ${color === colors.slate ? "#334155" : color}`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: 14,
                color: colors.text,
                opacity: interpolate(frame, [start, start + 10], [0, 1], clamp),
                scale: interpolate(frame, [start, start + 16], [0.5, 1], {
                  ...clamp,
                  easing: Easing.spring({ damping: 12 }),
                  output: "perceptual-scale",
                }),
              }}
            >
              <div style={{ fontSize: 26, fontWeight: 800 }}>{room}</div>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: color === colors.slate ? "#64748B" : color,
                  alignSelf: "flex-end",
                }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 64 }}>
        {stats.map((s, i) => (
          <div
            key={s.label}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 16,
              opacity: interpolate(frame, [62 + i * 6, 76 + i * 6], [0, 1], { ...clamp, easing: ease }),
              translate: interpolate(frame, [62 + i * 6, 76 + i * 6], ["0px 24px", "0px 0px"], {
                ...clamp,
                easing: ease,
              }),
            }}
          >
            <div style={{ fontSize: 72, fontWeight: 800, color: s.color, fontVariantNumeric: "tabular-nums" }}>
              {Math.round(interpolate(frame, [62 + i * 6, 90 + i * 6], [0, s.value], { ...clamp, easing: ease }))}
            </div>
            <div style={{ fontSize: 36, fontWeight: 600, color: colors.muted }}>{s.label}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
