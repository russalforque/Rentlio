import { AbsoluteFill, useCurrentFrame } from "remotion";
import { cameraAt, type Shot } from "../camera";
import { Caption } from "../Caption";
import { BrowserFrame, Cursor, enterStyle, type Layer } from "../Device";
import { fontFamily } from "../theme";

export type CursorPlan = { path: { at: number; x: number; y: number }[]; clicks: number[]; hideAt?: number };

/** Caption on the left, a real Rentlio screen on the right with camera moves and an optional cursor. */
export const ScreenScene: React.FC<{
  name: string;
  label: string;
  title: React.ReactNode;
  body?: string;
  path: string;
  layers: Layer[];
  shots: Shot[];
  cursor?: CursorPlan;
}> = ({ name, label, title, body, path, layers, shots, cursor }) => {
  const frame = useCurrentFrame();
  const camera = cameraAt(frame, shots);

  return (
    <AbsoluteFill name={name} style={{ fontFamily }}>
      <div style={{ position: "absolute", left: 120, top: 0, bottom: 0, display: "flex", alignItems: "center" }}>
        <Caption label={label} title={title} body={body} />
      </div>
      <div style={{ position: "absolute", left: 660, top: 130, ...enterStyle(frame, 2) }}>
        <BrowserFrame width={1240} path={path} camera={camera} layers={layers}>
          {cursor ? (scale) => <Cursor scale={scale} {...cursor} /> : undefined}
        </BrowserFrame>
      </div>
    </AbsoluteFill>
  );
};
