import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Shared Open Graph / Twitter card image for JIRITA auth links (reset
// password, accept invite). Same brand-consistent image for both routes;
// only the surrounding page metadata (title/description) differs.

export const ogImageSize = { width: 1200, height: 630 };
export const ogImageContentType = "image/png";

export async function renderJiritaOgImage() {
  const logoData = await readFile(join(process.cwd(), "public/img/jirita-logo.png"), "base64");
  const logoSrc = `data:image/png;base64,${logoData}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6655ee 0%, #5644dd 55%, #4736bb 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "white",
            borderRadius: 32,
            padding: "36px 56px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={434} height={94} alt="Techtivo" />
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "white",
          }}
        >
          Jirita
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 22,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          Project management, done simply
        </div>
      </div>
    ),
    { ...ogImageSize }
  );
}
