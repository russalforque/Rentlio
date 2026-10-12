import { Composition, Folder } from "remotion";
import { RentlioPromo } from "./RentlioPromo";
import { Billing } from "./scenes/Billing";
import { Dashboard } from "./scenes/Dashboard";
import { Intro } from "./scenes/Intro";
import { Outro } from "./scenes/Outro";
import { Payments } from "./scenes/Payments";
import { Rooms } from "./scenes/Rooms";
import { FPS, sceneFrames, TOTAL_FRAMES } from "./timeline";

const scenes = [
  { id: "Intro", key: "intro", component: Intro },
  { id: "Rooms", key: "rooms", component: Rooms },
  { id: "Billing", key: "billing", component: Billing },
  { id: "Payments", key: "payments", component: Payments },
  { id: "Dashboard", key: "dashboard", component: Dashboard },
  { id: "Outro", key: "outro", component: Outro },
] as const;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="RentlioPromo-Scenes">
        {scenes.map((s) => (
          <Composition
            key={s.id}
            id={s.id}
            component={s.component}
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
