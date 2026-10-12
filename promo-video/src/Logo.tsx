import { colors } from "./theme";

export const LogoMark: React.FC<{ size: number }> = ({ size }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.28,
      background: `linear-gradient(135deg, ${colors.indigo}, ${colors.violet})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `0 ${size * 0.2}px ${size * 0.6}px ${colors.indigo}66`,
    }}
  >
    <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none">
      <path
        d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z"
        fill="white"
      />
    </svg>
  </div>
);
