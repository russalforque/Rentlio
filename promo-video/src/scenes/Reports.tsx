import { ScreenScene } from "./ScreenScene";

export const Reports: React.FC = () => (
  <ScreenScene
    name="Reports"
    label="Reports"
    title={<>Every peso,<br />accounted for.</>}
    body="Twelve months of billed vs collected, ready for CSV."
    path="/reports"
    layers={[{ src: "screens/l-reports.png" }]}
    shots={[
      { at: 0, x: 800, y: 500, zoom: 1 },
      { at: 35, x: 800, y: 500, zoom: 1 },
      { at: 140, x: 905, y: 520, zoom: 1.22 },
    ]}
  />
);
