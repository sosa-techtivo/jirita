import { ogImageSize, ogImageContentType, renderJiritaOgImage } from "@/lib/og-image";

export const alt = "Jirita";
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return renderJiritaOgImage();
}
