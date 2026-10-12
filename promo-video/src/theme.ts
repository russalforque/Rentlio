import { Easing } from "remotion";
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

export const fontFamily = "Plus Jakarta Sans";

// Bundled locally (SIL OFL, see public/fonts/OFL.txt). The latin-ext files supply the ₱ sign.
for (const weight of ["400", "500", "600", "700", "800"]) {
  loadFont({ family: fontFamily, weight, url: staticFile(`fonts/plus-jakarta-sans-latin-${weight}-normal.woff2`) });
  loadFont({
    family: fontFamily,
    weight,
    unicodeRange: "U+20A0-20C0",
    url: staticFile(`fonts/plus-jakarta-sans-latin-ext-${weight}-normal.woff2`),
  });
}

export const colors = {
  bg: "#070B18",
  panel: "#0F1629",
  panelBorder: "rgba(148, 163, 184, 0.14)",
  text: "#F8FAFC",
  muted: "#94A3B8",
  indigo: "#6366F1",
  violet: "#8B5CF6",
  emerald: "#10B981",
  amber: "#F59E0B",
  rose: "#F43F5E",
  slate: "#1E293B",
};

export const ease = Easing.bezier(0.16, 1, 0.3, 1);

export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

export const peso = (n: number) => `₱${Math.round(n).toLocaleString("en-US")}`;
