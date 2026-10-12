import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Card, Pill } from "../Card";
import { Accent, Headline } from "../Headline";
import { clamp, colors, ease, fontFamily } from "../theme";

export const Payments: React.FC = () => {
  const frame = useCurrentFrame();
  const verified = frame >= 118;
  const proofSent = frame >= 84;

  return (
    <AbsoluteFill name="Payments" style={{ fontFamily, padding: "100px 160px", alignItems: "center", gap: 56 }}>
      <Headline
        align="center"
        eyebrow="Payments"
        title={
          <>
            Tenants pay. <Accent color={colors.emerald}>You verify in one tap.</Accent>
          </>
        }
      />

      <div style={{ display: "flex", alignItems: "center", gap: 120, flex: 1 }}>
        {/* Tenant phone */}
        <div
          style={{
            width: 360,
            height: 640,
            borderRadius: 56,
            border: "10px solid #1E293B",
            backgroundColor: colors.panel,
            padding: "56px 28px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            boxShadow: "0 40px 120px rgba(0,0,0,0.5)",
            opacity: interpolate(frame, [16, 30], [0, 1], clamp),
            translate: interpolate(frame, [16, 40], ["-140px 0px", "0px 0px"], { ...clamp, easing: ease }),
          }}
        >
          <div style={{ fontSize: 22, color: colors.muted, fontWeight: 600 }}>Hi, Room 204 👋</div>
          <div style={{ borderRadius: 24, padding: 24, background: `linear-gradient(135deg, ${colors.indigo}, ${colors.violet})` }}>
            <div style={{ fontSize: 20, color: "#E0E7FF", fontWeight: 600 }}>Amount due</div>
            <div style={{ fontSize: 48, color: "white", fontWeight: 800 }}>₱8,554</div>
            <div style={{ fontSize: 18, color: "#E0E7FF", fontWeight: 500 }}>Due Oct 10</div>
          </div>
          <div
            style={{
              borderRadius: 18,
              padding: "20px 0",
              textAlign: "center",
              fontSize: 26,
              fontWeight: 800,
              color: colors.bg,
              backgroundColor: colors.text,
              scale: interpolate(frame, [44, 48, 54], [1, 0.9, 1], clamp),
            }}
          >
            Pay now
          </div>
          <div
            style={{
              borderRadius: 18,
              border: `2px dashed ${proofSent ? colors.emerald : "#334155"}`,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              opacity: interpolate(frame, [50, 58], [0, 1], clamp),
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: proofSent ? colors.emerald : colors.text }}>
              {proofSent ? "✓ Proof sent" : "Uploading proof…"}
            </div>
            <div style={{ height: 10, borderRadius: 5, backgroundColor: colors.slate, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  backgroundColor: colors.emerald,
                  width: `${interpolate(frame, [54, 82], [0, 100], { ...clamp, easing: ease })}%`,
                }}
              />
            </div>
            <div style={{ fontSize: 18, color: colors.muted, fontWeight: 500 }}>gcash-receipt.jpg</div>
          </div>
        </div>

        {/* Connector */}
        <div style={{ position: "relative", width: 160, height: 4, backgroundColor: colors.slate, borderRadius: 2 }}>
          <div
            style={{
              position: "absolute",
              top: -14,
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: colors.emerald,
              boxShadow: `0 0 30px ${colors.emerald}`,
              left: interpolate(frame, [84, 104], [-16, 144], { ...clamp, easing: ease }),
              opacity: interpolate(frame, [84, 88, 102, 106], [0, 1, 1, 0], clamp),
            }}
          />
        </div>

        {/* Landlord verification queue */}
        <div
          style={{
            opacity: interpolate(frame, [24, 38], [0, 1], clamp),
            translate: interpolate(frame, [24, 48], ["140px 0px", "0px 0px"], { ...clamp, easing: ease }),
          }}
        >
          <Card style={{ width: 760, padding: 44 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 32 }}>
              <div style={{ fontSize: 40, fontWeight: 800, color: colors.text }}>To verify</div>
              <div
                style={{
                  minWidth: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: verified ? colors.slate : colors.rose,
                  color: "white",
                  fontSize: 26,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  scale: interpolate(frame, [102, 110], [0.4, 1], {
                    ...clamp,
                    easing: Easing.spring({ damping: 10 }),
                    output: "perceptual-scale",
                  }),
                }}
              >
                {frame < 102 ? 0 : verified ? 0 : 1}
              </div>
            </div>

            <div
              style={{
                borderRadius: 24,
                border: `2px solid ${verified ? colors.emerald : colors.panelBorder}`,
                backgroundColor: verified ? "#06231C" : "#0B1222",
                padding: 28,
                display: "flex",
                alignItems: "center",
                gap: 24,
                opacity: interpolate(frame, [100, 110], [0, 1], clamp),
                translate: interpolate(frame, [100, 114], ["0px 30px", "0px 0px"], { ...clamp, easing: ease }),
              }}
            >
              <div
                style={{
                  width: 88,
                  height: 110,
                  borderRadius: 14,
                  background: "linear-gradient(160deg, #1D4ED8, #0EA5E9)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: 18,
                  fontWeight: 800,
                }}
              >
                PROOF
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: colors.text }}>Room 204 · ₱8,554</div>
                <div style={{ fontSize: 24, fontWeight: 500, color: colors.muted, marginTop: 6 }}>
                  October bill · GCash
                </div>
              </div>
              {verified ? (
                <div
                  style={{
                    scale: interpolate(frame, [118, 130], [0.5, 1], {
                      ...clamp,
                      easing: Easing.spring({ damping: 9 }),
                      output: "perceptual-scale",
                    }),
                  }}
                >
                  <Pill color={colors.emerald} style={{ fontSize: 28 }}>
                    Verified
                  </Pill>
                </div>
              ) : (
                <div
                  style={{
                    padding: "16px 30px",
                    borderRadius: 16,
                    backgroundColor: colors.emerald,
                    color: "white",
                    fontSize: 28,
                    fontWeight: 800,
                    scale: interpolate(frame, [112, 116, 120], [1, 0.88, 1], clamp),
                  }}
                >
                  Approve
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AbsoluteFill>
  );
};
