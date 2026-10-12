import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Caption } from "../Caption";
import { Cursor, enterStyle, PhoneFrame } from "../Device";
import { fontFamily } from "../theme";

export const Tenant: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Tenant" style={{ fontFamily }}>
      <div style={{ position: "absolute", left: 120, top: 0, bottom: 0, display: "flex", alignItems: "center" }}>
        <Caption
          label="Tenant portal"
          title={<>Tenants pay from<br />their phone.</>}
          body="Proof of payment, uploaded in seconds."
          width={640}
        />
      </div>
      <div style={{ position: "absolute", left: 1130, top: 78, ...enterStyle(frame, 2) }}>
        <PhoneFrame
          width={410}
          layers={[
            { src: "screens/t-home.png" },
            { src: "screens/t-pay-filled.png", in: [52, 68], sheet: true },
            { src: "screens/t-home-sent.png", in: [124, 134] },
          ]}
        >
          {(scale) => (
            <Cursor
              touch
              scale={scale}
              path={[
                { at: 78, x: 300, y: 640 },
                { at: 104, x: 195, y: 786 },
              ]}
              clicks={[110]}
              hideAt={118}
            />
          )}
        </PhoneFrame>
      </div>
    </AbsoluteFill>
  );
};
