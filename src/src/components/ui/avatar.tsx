import { FALLBACK_AVATAR } from "@/lib/current-user";
import { getAvatarColors, getInitials } from "@/lib/avatar";

interface AvatarProps {
  src?: string | null;
  name: string;
  alt?: string;
  className?: string;
  title?: string;
}

function extractSizePx(className: string): number {
  const match = className.match(/\bw-(\d+(?:\.\d+)?)\b/);
  if (!match) return 32;
  return parseFloat(match[1]) * 4;
}

// Drop-in replacement for a plain avatar <img>: shows the real photo when
// present, otherwise falls back to initials on a deterministic pastel
// circle. Pass the exact className the <img> used — size/shape carry over
// unchanged, and the fallback's font size scales off the same className.
export function Avatar({ src, name, alt, className = "", title }: AvatarProps) {
  const hasPhoto = !!src && src !== FALLBACK_AVATAR;

  if (hasPhoto) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt ?? name} className={className} title={title} />;
  }

  const { bg, text } = getAvatarColors(name);
  const size = extractSizePx(className);

  return (
    <div
      role="img"
      aria-label={alt ?? name}
      title={title}
      className={`${className} ${bg} ${text} flex items-center justify-center font-semibold select-none`}
      style={{ fontSize: Math.max(8, size * 0.42) }}
    >
      {getInitials(name)}
    </div>
  );
}
