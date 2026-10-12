import { ScreenScene } from "./ScreenScene";

export const Rooms: React.FC = () => (
  <ScreenScene
    name="Rooms"
    label="Rooms & tenants"
    title={<>Every room.<br />Every tenant.</>}
    body="Who's in, what's free, and who still owes."
    path="/rooms"
    layers={[{ src: "screens/l-rooms.png" }]}
    shots={[
      { at: 0, x: 800, y: 500, zoom: 1 },
      { at: 40, x: 900, y: 560, zoom: 1.3 },
      { at: 105, x: 680, y: 590, zoom: 2.3 },
    ]}
  />
);
