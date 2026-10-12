import { AbsoluteFill, Composition, Folder } from "remotion";
import { Background } from "./Background";
import { RentlioPromo } from "./RentlioPromo";
import { Billing } from "./scenes/Billing";
import { Dashboard } from "./scenes/Dashboard";
import { Intro } from "./scenes/Intro";
import { Outro } from "./scenes/Outro";
import { Reports } from "./scenes/Reports";
import { Rooms } from "./scenes/Rooms";
import { Tenant } from "./scenes/Tenant";
import { Verify } from "./scenes/Verify";
import { FPS, sceneFrames, type SceneId, TOTAL_FRAMES } from "./timeline";

const scenes: { id: string; key: SceneId; component: React.FC }[] = [
  { id: "Intro", key: "intro", component: Intro },
  { id: "Dashboard", key: "dashboard", component: Dashboard },
  { id: "Rooms", key: "rooms", component: Rooms },
  { id: "Billing", key: "billing", component: Billing },
  { id: "Tenant", key: "tenant", component: Tenant },
  { id: "Verify", key: "verify", component: Verify },
  { id: "Reports", key: "reports", component: Reports },
  { id: "Outro", key: "outro", component: Outro },
];

// Standalone scene previews get the same backdrop as the full video
const withBackground = (Scene: React.FC) => {
  const Wrapped: React.FC = () => (
    <AbsoluteFill>
      <Background />
      <Scene />
    </AbsoluteFill>
  );
  return Wrapped;
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="RentlioPromo-Scenes">
        {scenes.map((s) => (
          <Composition
            key={s.id}
            id={s.id}
            component={withBackground(s.component)}
            width={1920}
            height={1080}
            fps={FPS}
            durationInFrames={sceneFrames(s.key)}
          />
        ))}
      </Folder>
      <Composition
        id="RentlioPromo"
        component={RentlioPromo}
        width={1920}
        height={1080}
        fps={FPS}
        durationInFrames={TOTAL_FRAMES}
      />
    </>
  );
};
