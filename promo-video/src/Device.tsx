import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { Camera } from "./camera";
import { clamp, colors, ease, fontFamily, inOut } from "./theme";

export type Layer = {
  src: string;
  /** Frame range over which this layer fades in. */
  in?: [number, number];
  /** Slide up from the bottom while fading in, like a bottom sheet. */
  sheet?: boolean;
};

/** Screenshot layers, scaled and framed by a camera, with optional overlays in the same CSS pixel space. */
const Viewport: React.FC<{
  width: number;
  height: number;
  contentWidth: number;
  contentHeight: number;
  camera: Camera;
  layers: Layer[];
  children?: (scale: number) => React.ReactNode;
}> = ({ width, height, contentWidth, contentHeight, camera, layers, children }) => {
  const frame = useCurrentFrame();
  const base = width / contentWidth;
  const scale = base * camera.zoom;
  // Keep the view inside the screenshot
  const halfW = contentWidth / (2 * camera.zoom);
  const halfH = contentHeight / (2 * camera.zoom);
  const x = Math.min(Math.max(camera.x, halfW), contentWidth - halfW);
  const y = Math.min(Math.max(camera.y, halfH), contentHeight - halfH);

  return (
    <div style={{ position: "relative", width, height, overflow: "hidden", backgroundColor: colors.canvas }}>
      <div
        style={{
          position: "absolute",
          width: contentWidth,
          height: contentHeight,
          transformOrigin: "0 0",
          transform: `translate(${width / 2}px, ${height / 2}px) scale(${scale}) translate(${-x}px, ${-y}px)`,
        }}
      >
        {layers.map((layer) => {
          const [a, b] = layer.in ?? [-1, 0];
          return (
            <Img
              key={layer.src}
              src={staticFile(layer.src)}
              style={{
                position: "absolute",
                inset: 0,
                width: contentWidth,
                height: contentHeight,
                opacity: interpolate(frame, layer.sheet ? [a, a + 3] : [a, b], [0, 1], clamp),
                translate: layer.sheet
                  ? interpolate(frame, [a, b + 6], [`0px ${contentHeight * 0.6}px`, "0px 0px"], { ...clamp, easing: ease })
                  : undefined,
              }}
            />
          );
        })}
        {children?.(scale)}
      </div>
    </div>
  );
};

/** A minimal browser window around a 1600×1000 screenshot. */
export const BrowserFrame: React.FC<{
  width: number;
  path: string;
  camera: Camera;
  layers: Layer[];
  children?: (scale: number) => React.ReactNode;
}> = ({ width, path, camera, layers, children }) => {
  const height = (width / 1600) * 1000;
  return (
    <div
      style={{
        borderRadius: 18,
        overflow: "hidden",
        border: `1.5px solid ${colors.border}`,
        boxShadow: "0 50px 140px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.4)",
        backgroundColor: "#1c1c20",
      }}
    >
      <div style={{ height: 46, display: "flex", alignItems: "center", gap: 10, padding: "0 18px" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 13, height: 13, borderRadius: 7, backgroundColor: c, opacity: 0.85 }} />
        ))}
        <div
          style={{
            marginLeft: 20,
            flex: 1,
            maxWidth: 520,
            height: 28,
            borderRadius: 8,
            backgroundColor: "rgba(255,255,255,0.07)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 12px",
            fontFamily,
            fontSize: 15,
            color: colors.muted,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <span style={{ color: colors.text }}>rentlio</span>
          <span>{path}</span>
        </div>
      </div>
      <Viewport width={width} height={height} contentWidth={1600} contentHeight={1000} camera={camera} layers={layers}>
        {children}
      </Viewport>
    </div>
  );
};

/** A phone around a 390×844 screenshot. */
export const PhoneFrame: React.FC<{ width: number; layers: Layer[]; children?: (scale: number) => React.ReactNode }> = ({
  width,
  layers,
  children,
}) => {
  const height = (width / 390) * 844;
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 64,
        backgroundColor: "#0a0a0b",
        border: "2px solid #2a2a30",
        boxShadow: "0 50px 140px rgba(0,0,0,0.6)",
      }}
    >
      <div style={{ borderRadius: 50, overflow: "hidden" }}>
        <Viewport
          width={width}
          height={height}
          contentWidth={390}
          contentHeight={844}
          camera={{ x: 195, y: 422, zoom: 1 }}
          layers={layers}
        >
          {children}
        </Viewport>
      </div>
    </div>
  );
};

/** Pointer that glides between points and pulses on click. Coordinates are screenshot CSS pixels. */
export const Cursor: React.FC<{
  scale: number;
  path: { at: number; x: number; y: number }[];
  clicks: number[];
  hideAt?: number;
  touch?: boolean;
}> = ({ scale, path, clicks, hideAt = 100000, touch }) => {
  const frame = useCurrentFrame();
  const frames = path.map((p) => p.at);
  const x = interpolate(frame, frames, path.map((p) => p.x), { ...clamp, easing: inOut });
  const y = interpolate(frame, frames, path.map((p) => p.y), { ...clamp, easing: inOut });
  const size = 1 / scale;
  const press = clicks.reduce((m, c) => Math.max(m, interpolate(frame, [c - 3, c, c + 6], [0, 1, 0], clamp)), 0);
  const ripples = clicks.filter((c) => frame >= c && frame < c + 22);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity: interpolate(frame, [path[0].at, path[0].at + 8, hideAt, hideAt + 6], [0, 1, 1, 0], clamp),
      }}
    >
      {ripples.map((c) => (
        <div
          key={c}
          style={{
            position: "absolute",
            width: 90 * size,
            height: 90 * size,
            left: -45 * size,
            top: -45 * size,
            borderRadius: "50%",
            border: `${4 * size}px solid ${colors.highlight}`,
            scale: interpolate(frame - c, [0, 22], [0.2, 1.3], { ...clamp, easing: ease }),
            opacity: interpolate(frame - c, [0, 22], [1, 0], clamp),
          }}
        />
      ))}
      {touch ? (
        <div
          style={{
            width: 56 * size,
            height: 56 * size,
            marginLeft: -28 * size,
            marginTop: -28 * size,
            borderRadius: "50%",
            backgroundColor: "rgba(18,18,20,0.28)",
            border: `${3 * size}px solid rgba(255,255,255,0.9)`,
            scale: 1 - press * 0.25,
          }}
        />
      ) : (
        <svg
          width={34 * size}
          height={34 * size}
          viewBox="0 0 24 24"
          style={{ scale: 1 - press * 0.18, transformOrigin: "0 0", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))" }}
        >
          <path d="M4 2.5 19 13.6l-6.6 1.1 3.8 7-2.9 1.4-3.7-7.1L4 20.5Z" fill={colors.ink} stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
};

/** Slide-and-fade entrance for a device frame. */
export const enterStyle = (frame: number, delay = 0): React.CSSProperties => ({
  opacity: interpolate(frame, [delay, delay + 14], [0, 1], clamp),
  translate: interpolate(frame, [delay, delay + 30], ["120px 40px", "0px 0px"], { ...clamp, easing: ease }),
  scale: interpolate(frame, [delay, delay + 30], [0.94, 1], { ...clamp, easing: ease }),
});

export { inOut };
