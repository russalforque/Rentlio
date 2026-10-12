import { colors } from "./theme";

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      backgroundColor: colors.panel,
      border: `1.5px solid ${colors.panelBorder}`,
      borderRadius: 32,
      boxShadow: "0 40px 120px rgba(0,0,0,0.45)",
      ...style,
    }}
  >
    {children}
  </div>
);

export const Pill: React.FC<{ color: string; children: React.ReactNode; style?: React.CSSProperties }> = ({
  color,
  children,
  style,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 20px",
      borderRadius: 999,
      backgroundColor: `${color}22`,
      color,
      fontSize: 24,
      fontWeight: 700,
      ...style,
    }}
  >
    <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
    {children}
  </div>
);
