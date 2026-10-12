import { interpolate } from "remotion";
import { clamp, inOut } from "./theme";

/** A camera keyframe: centre of view (in screenshot CSS pixels) and zoom. */
export type Shot = { at: number; x: number; y: number; zoom: number };

export type Camera = { x: number; y: number; zoom: number };

/** Interpolates camera keyframes with a smooth in-out move between each. */
export const cameraAt = (frame: number, shots: Shot[]): Camera => {
  const frames = shots.map((s) => s.at);
  const pick = (key: "x" | "y" | "zoom") =>
    shots.length === 1
      ? shots[0][key]
      : interpolate(
          frame,
          frames,
          shots.map((s) => s[key]),
          { ...clamp, easing: inOut },
        );
  return { x: pick("x"), y: pick("y"), zoom: pick("zoom") };
};
