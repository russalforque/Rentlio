import { loadFont } from "@remotion/fonts";
import { Easing, staticFile } from "remotion";

export const fontFamily = "Geist";

// Rentlio's own typeface, bundled locally (SIL OFL, see public/fonts/OFL.txt).
// The latin-ext file supplies the ₱ sign.
loadFont({ family: fontFamily, weight: "100 900", url: staticFile("fonts/geist-latin-wght-normal.woff2") });
loadFont({
  family: fontFamily,
  weight: "100 900",
  unicodeRange: "U+20A0-20C0",
  url: staticFile("fonts/geist-latin-ext-wght-normal.woff2"),
});

// Taken from the app's theme tokens (src/index.css)
export const colors = {
  ink: "#121214",
  inkRaised: "#1c1c20",
  text: "#f5f5f7",
  muted: "#a1a1aa",
  highlight: "#f2b52b",
  success: "#22a462",
  violet: "#8b5cf6",
  chart: "#6b7bf0",
  canvas: "#f4f4f6",
  border: "rgba(255,255,255,0.08)",
};

export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);

export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
