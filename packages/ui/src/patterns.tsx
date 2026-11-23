import { useId, type CSSProperties } from 'react';

/*
 * Craft patterns ported from the legacy CSS variables --shuka, --kiondo and --mosaic
 * (legacy/platform_v33.html, line 72). Same tiles, same colours, drawn as inline SVG patterns.
 * All are decorative: aria-hidden, and hidden in print via the `decor` class.
 */

type BandProps = { className?: string; style?: CSSProperties; height?: number };

/** Maasai shuka check: an 8px strip under the top bar (tile 24px drawn at 14px). */
export function ShukaStrip({ className = '', style, height = 8 }: BandProps) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className={`decor block w-full ${className}`}
      style={style}
      height={height}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={`shuka${id}`} width="14" height="14" patternUnits="userSpaceOnUse">
          <g transform="scale(0.5833)">
            <rect width="24" height="24" fill="#c8102e" />
            <rect y="0" width="24" height="4" fill="#8e0c22" />
            <rect x="0" width="4" height="24" fill="#8e0c22" opacity=".7" />
            <rect y="10" width="24" height="2" fill="#1d3f7a" />
            <rect x="10" width="2" height="24" fill="#1d3f7a" opacity=".8" />
            <rect y="17" width="24" height="1" fill="#1a1110" />
            <rect x="17" width="1" height="24" fill="#1a1110" opacity=".8" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#shuka${id})`} />
    </svg>
  );
}

/** Kiondo basket weave band: under section headers and above the footer. */
export function KiondoBand({ className = '', style, height = 14 }: BandProps) {
  const id = useId().replace(/:/g, '');
  const scale = height / 16;
  const w = 24 * scale;
  return (
    <svg
      className={`decor block w-full ${className}`}
      style={style}
      height={height}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={`kiondo${id}`} width={w} height={height} patternUnits="userSpaceOnUse">
          <g transform={`scale(${scale})`}>
            <rect width="24" height="16" fill="#e9d3a3" />
            <rect width="24" height="3" fill="#3a2416" />
            <rect y="13" width="24" height="3" fill="#3a2416" />
            <path d="M0 13 L6 4 L12 13Z" fill="#b5542b" />
            <path d="M12 13 L18 4 L24 13Z" fill="#d99a2b" />
            <circle cx="12" cy="6" r="1.2" fill="#3a2416" />
            <circle cx="0" cy="6" r="1.2" fill="#3a2416" />
            <circle cx="24" cy="6" r="1.2" fill="#3a2416" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#kiondo${id})`} />
    </svg>
  );
}

/** Heritage mosaic: a faint 64px tile that fills its positioned parent (home hero, footer). */
export function HeritageMosaic({ className = '', style }: { className?: string; style?: CSSProperties }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className={`decor pointer-events-none absolute inset-0 h-full w-full ${className}`}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={`mosaic${id}`} width="64" height="64" patternUnits="userSpaceOnUse">
          <g opacity=".07">
            <path d="M0 0 L32 0 L16 16Z" fill="#b5542b" />
            <path d="M32 0 L64 0 L48 16Z" fill="#d99a2b" />
            <path d="M16 16 L32 32 L16 48 L0 32Z" fill="#3c7a3b" />
            <path d="M48 16 L64 32 L48 48 L32 32Z" fill="#b5542b" />
            <path d="M0 64 L32 64 L16 48Z" fill="#d99a2b" />
            <path d="M32 64 L64 64 L48 48Z" fill="#3c7a3b" />
            <circle cx="32" cy="32" r="3" fill="#3a2416" />
            <circle cx="0" cy="32" r="2" fill="#3a2416" />
            <circle cx="64" cy="32" r="2" fill="#3a2416" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#mosaic${id})`} />
    </svg>
  );
}

/** The Cottid Africa mark (seven grains around a seed), from the legacy top bar. */
export function CottidMark({ size = 30, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="138.2" cy="51.1" rx="20.5" ry="11.8" transform="rotate(38.0 138.2 51.1)" fill="#ffc93c" />
      <ellipse cx="95.0" cy="38.2" rx="20.5" ry="11.8" transform="rotate(-4.7 95.0 38.2)" fill="#f7b828" />
      <ellipse cx="54.4" cy="58.0" rx="20.5" ry="11.8" transform="rotate(-47.3 54.4 58.0)" fill="#eea614" />
      <ellipse cx="38.0" cy="100.0" rx="20.5" ry="11.8" transform="rotate(-90.0 38.0 100.0)" fill="#e69500" />
      <ellipse cx="54.4" cy="142.0" rx="20.5" ry="11.8" transform="rotate(-132.7 54.4 142.0)" fill="#da7307" />
      <ellipse cx="95.0" cy="161.8" rx="20.5" ry="11.8" transform="rotate(-175.3 95.0 161.8)" fill="#ce500f" />
      <ellipse cx="138.2" cy="148.9" rx="20.5" ry="11.8" transform="rotate(-218.0 138.2 148.9)" fill="#c22e16" />
      <circle cx="100" cy="100" r="18.6" fill="#e69500" />
    </svg>
  );
}
