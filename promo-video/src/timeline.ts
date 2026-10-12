import voiceover from "./voiceover.json";

export const FPS = 30;
export const TRANSITION = 15;
// Voice starts this many frames into each scene
export const VO_LEAD = 10;
const TAIL = 20;

type SceneId = keyof typeof voiceover;

// Minimum lengths so each scene's animation has room to finish
const MIN_FRAMES: Record<SceneId, number> = {
  intro: 90,
  rooms: 120,
  billing: 130,
  payments: 150,
  dashboard: 120,
  outro: 120,
};

export const SCENE_IDS = Object.keys(voiceover) as SceneId[];

export const sceneFrames = (id: SceneId) => {
  const extra = id === "outro" ? 45 : 0;
  return Math.max(MIN_FRAMES[id], Math.ceil(voiceover[id] * FPS) + VO_LEAD + TAIL + TRANSITION + extra);
};

export const TOTAL_FRAMES =
  SCENE_IDS.reduce((sum, id) => sum + sceneFrames(id), 0) - TRANSITION * (SCENE_IDS.length - 1);

// Frame where each scene starts in the full video (for music ducking)
export const sceneStart = (id: SceneId) => {
  let start = 0;
  for (const s of SCENE_IDS) {
    if (s === id) return start;
    start += sceneFrames(s) - TRANSITION;
  }
  return start;
};

export const voDuration = (id: SceneId) => Math.ceil(voiceover[id] * FPS);
