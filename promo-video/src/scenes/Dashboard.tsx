import { ScreenScene } from "./ScreenScene";

export const Dashboard: React.FC = () => (
  <ScreenScene
    name="Dashboard"
    label="Dashboard"
    title={<>Your property,<br />at a glance.</>}
    body="Collections, arrears and what needs you today."
    path="/dashboard"
    layers={[{ src: "screens/l-dashboard.png" }]}
    shots={[
      { at: 0, x: 800, y: 500, zoom: 1 },
      { at: 45, x: 800, y: 500, zoom: 1 },
      { at: 85, x: 960, y: 250, zoom: 1.45 },
      { at: 130, x: 960, y: 250, zoom: 1.45 },
      { at: 170, x: 1360, y: 515, zoom: 2 },
    ]}
  />
);
