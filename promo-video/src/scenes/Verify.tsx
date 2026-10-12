import { ScreenScene } from "./ScreenScene";

export const Verify: React.FC = () => (
  <ScreenScene
    name="Verify"
    label="Payments"
    title={<>Verify in<br />one tap.</>}
    body="Check the receipt. The bill updates itself."
    path="/payments"
    layers={[
      { src: "screens/l-payments-review.png" },
      { src: "screens/l-payments-verified.png", in: [126, 136] },
      { src: "screens/l-bill-paid.png", in: [175, 190] },
    ]}
    shots={[
      { at: 0, x: 800, y: 500, zoom: 1 },
      { at: 35, x: 800, y: 420, zoom: 1.55 },
      { at: 70, x: 800, y: 420, zoom: 1.55 },
      { at: 100, x: 1000, y: 820, zoom: 1.6 },
      { at: 126, x: 900, y: 300, zoom: 1.4 },
      { at: 175, x: 900, y: 300, zoom: 1.4 },
      { at: 195, x: 800, y: 330, zoom: 1.5 },
    ]}
    cursor={{
      path: [
        { at: 72, x: 1250, y: 620 },
        { at: 108, x: 1000, y: 912 },
      ],
      clicks: [114],
      hideAt: 124,
    }}
  />
);
