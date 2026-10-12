import { ScreenScene } from "./ScreenScene";

export const Billing: React.FC = () => (
  <ScreenScene
    name="Billing"
    label="Automatic billing"
    title={<>Bills that write<br />themselves.</>}
    body="Meter readings turn into electricity charges."
    path="/billing/readings"
    layers={[{ src: "screens/l-readings.png" }, { src: "screens/l-bill.png", in: [100, 116] }]}
    shots={[
      { at: 0, x: 900, y: 390, zoom: 1.17 },
      { at: 95, x: 905, y: 420, zoom: 1.2 },
      { at: 116, x: 660, y: 340, zoom: 1.6 },
      { at: 200, x: 670, y: 340, zoom: 1.72 },
    ]}
    cursor={{
      path: [
        { at: 28, x: 1520, y: 720 },
        { at: 58, x: 1330, y: 424 },
      ],
      clicks: [64],
      hideAt: 98,
    }}
  />
);
