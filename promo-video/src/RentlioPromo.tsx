import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Fragment } from "react";
import { AbsoluteFill, interpolate, staticFile } from "remotion";
import { Background } from "./Background";
import { Billing } from "./scenes/Billing";
import { Dashboard } from "./scenes/Dashboard";
import { Intro } from "./scenes/Intro";
import { Outro } from "./scenes/Outro";
import { Reports } from "./scenes/Reports";
import { Rooms } from "./scenes/Rooms";
import { Tenant } from "./scenes/Tenant";
import { Verify } from "./scenes/Verify";
import { SCENE_IDS, sceneFrames, sceneStart, TOTAL_FRAMES, TRANSITION, VO_LEAD, voDuration } from "./timeline";

const SCENES = {
  intro: Intro,
  dashboard: Dashboard,
  rooms: Rooms,
  billing: Billing,
  tenant: Tenant,
  verify: Verify,
  reports: Reports,
  outro: Outro,
};

const MUSIC_FULL = 0.55;
const MUSIC_DUCKED = 0.16;

// Lower the music while the narrator speaks
const musicVolume = (f: number) => {
  let duck = 0;
  for (const id of SCENE_IDS) {
    const start = sceneStart(id) + VO_LEAD;
    const end = start + voDuration(id);
    duck = Math.max(duck, interpolate(f, [start - 8, start, end, end + 12], [0, 1, 1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }));
  }
  const fadeOut = interpolate(f, [TOTAL_FRAMES - 45, TOTAL_FRAMES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (MUSIC_FULL - (MUSIC_FULL - MUSIC_DUCKED) * duck) * fadeOut;
};

export const RentlioPromo: React.FC = () => {
  return (
    <AbsoluteFill>
      <Background />
      <Audio src={staticFile("music.mp3")} volume={musicVolume} />
      <TransitionSeries>
        {SCENE_IDS.map((id, i) => {
          const Scene = SCENES[id];
          return (
            <Fragment key={id}>
              {i > 0 ? (
                <TransitionSeries.Transition
                  presentation={i % 2 === 0 ? slide({ direction: "from-right" }) : fade()}
                  timing={linearTiming({ durationInFrames: TRANSITION })}
                />
              ) : null}
              <TransitionSeries.Sequence name={id} durationInFrames={sceneFrames(id)}>
                <Scene />
                <Audio from={VO_LEAD} src={staticFile(`voiceover/${id}.mp3`)} />
              </TransitionSeries.Sequence>
            </Fragment>
          );
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
