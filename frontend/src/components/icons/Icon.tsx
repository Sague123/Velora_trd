import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 15, strokeWidth = 1.8, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {children}
    </svg>
  );
}

// A small, consistent line-icon set replacing emoji across the terminal —
// kept monochrome (currentColor) so it inherits whatever text color/theme
// context it's placed in, rather than rendering as colorful OS emoji glyphs.
export const IconHome = (p: IconProps) => base({ ...p, children: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" /></> });
export const IconTrade = (p: IconProps) => base({ ...p, children: <><path d="M4 8h13M17 8l-3-3M17 8l-3 3" /><path d="M20 16H7M7 16l3-3M7 16l3 3" /></> });
export const IconMarkets = (p: IconProps) => base({ ...p, children: <><path d="M4 20V10M11 20V4M18 20v-7" /><path d="M3 20h18" /></> });
export const IconBot = (p: IconProps) => base({ ...p, children: <><rect x="5" y="8" width="14" height="11" rx="2.5" /><path d="M12 8V4" /><circle cx="12" cy="3" r="1" /><path d="M2 13h2M20 13h2" /><circle cx="9.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="14.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" /></> });
export const IconLock = (p: IconProps) => base({ ...p, children: <><rect x="4.5" y="10.5" width="15" height="9.5" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" /></> });
export const IconVault = (p: IconProps) => base({ ...p, children: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="12" cy="12" r="4" /><path d="M12 8v1.5M12 14.5V16M8 12h1.5M14.5 12H16" /></> });
export const IconPencil = (p: IconProps) => base({ ...p, children: <><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /><path d="M14.5 5.5l3 3" /></> });
export const IconServer = (p: IconProps) => base({ ...p, children: <><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></> });
export const IconSun = (p: IconProps) => base({ ...p, children: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> });
export const IconMoon = (p: IconProps) => base({ ...p, children: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" /> });
export const IconArrowRight = (p: IconProps) => base({ ...p, children: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></> });
export const IconWalletPlus = (p: IconProps) => base({ ...p, children: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><path d="M15 14.5h4M17 12.5v4" /></> });
export const IconWalletMinus = (p: IconProps) => base({ ...p, children: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><path d="M15 14.5h4" /></> });
export const IconSwap = (p: IconProps) => base({ ...p, children: <><path d="M17 3v9a2 2 0 0 1-2 2H4" /><path d="m7 11-3 3 3 3" /><path d="M7 21v-9a2 2 0 0 1 2-2h11" /><path d="m17 13 3-3-3-3" /></> });
export const IconTrendUp = (p: IconProps) => base({ ...p, children: <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 6h6v6" /></> });
export const IconTrendDown = (p: IconProps) => base({ ...p, children: <><path d="m3 7 6 6 4-4 8 8" /><path d="M15 18h6v-6" /></> });
export const IconBolt = (p: IconProps) => base({ ...p, children: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" /> });
export const IconTarget = (p: IconProps) => base({ ...p, children: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.6" fill="currentColor" /></> });
export const IconGrid = (p: IconProps) => base({ ...p, children: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> });
export const IconFlask = (p: IconProps) => base({ ...p, children: <><path d="M9 3h6M10 3v6l-5.5 9a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9V3" /><path d="M7.5 15h9" /></> });
export const IconCoin = (p: IconProps) => base({ ...p, children: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.3c0-1.1 1.1-2 2.5-2s2.5.7 2.5 1.8c0 2.4-5 1.4-5 3.8 0 1.1 1.1 1.9 2.5 1.9s2.5-.8 2.5-1.9" /></> });
export const IconCamera = (p: IconProps) => base({ ...p, children: <><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.5" r="3.3" /></> });
export const IconClipboard = (p: IconProps) => base({ ...p, children: <><rect x="5" y="4" width="14" height="17" rx="2" /><rect x="8.5" y="2.5" width="7" height="3.5" rx="1" /><path d="M8.5 11h7M8.5 15h7M8.5 19h4" /></> });
export const IconGear = (p: IconProps) => base({ ...p, children: <><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.5-2-3.4-2.2.9a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.2-.9-2 3.4L4.6 10.5a7.6 7.6 0 0 0 0 3l-1.9 1.5 2 3.4 2.2-.9c.76.66 1.64 1.17 2.6 1.5l.5 2.5h4l.5-2.5a7.6 7.6 0 0 0 2.6-1.5l2.2.9 2-3.4Z" /></> });
export const IconCheck = (p: IconProps) => base({ ...p, children: <path d="M4 12.5 9.5 18 20 6" /> });
export const IconClose = (p: IconProps) => base({ ...p, children: <><path d="M6 6l12 12M18 6 6 18" /></> });
export const IconWarning = (p: IconProps) => base({ ...p, children: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" /></> });
export const IconInfo = (p: IconProps) => base({ ...p, children: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="8" r="0.8" fill="currentColor" stroke="none" /></> });
export const IconCandles = (p: IconProps) => base({ ...p, children: <><path d="M6 3v4M6 13v8M11 3v2M11 11v10M16 3v6M16 15v6" /><rect x="4" y="7" width="4" height="6" rx="0.5" /><rect x="9" y="5" width="4" height="6" rx="0.5" /><rect x="14" y="9" width="4" height="6" rx="0.5" /></> });
export const IconBook = (p: IconProps) => base({ ...p, children: <><path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-1.5H4Z" /><path d="M20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-1.5h6Z" /></> });
export const IconRefresh = (p: IconProps) => base({ ...p, children: <><path d="M4 12a8 8 0 0 1 14-5.3L20 9" /><path d="M20 5v4h-4" /><path d="M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M4 19v-4h4" /></> });
export const IconUsers = (p: IconProps) => base({ ...p, children: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" /><circle cx="17.5" cy="9" r="2.3" /><path d="M15.5 20v-1a4 4 0 0 0-1-2.6" /><path d="M20.5 20v-1a4 4 0 0 0-3-3.9" /></> });
export const IconCard = (p: IconProps) => base({ ...p, children: <><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M2.5 10h19" /><path d="M6 14.5h4" /></> });
export const IconCrypto = (p: IconProps) => base({ ...p, children: <><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><rect x="6" y="6" width="12" height="12" rx="3" /><path d="M9.5 9.5h3a1.7 1.7 0 0 1 0 3.4h-3m0 0h3.4a1.8 1.8 0 0 1 0 3.6h-3.4m0-7v-1.3m0 8.3v1.3m2.4-9.6v-1.3m0 8.3v1.3" /></> });
export const IconCopy = (p: IconProps) => base({ ...p, children: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></> });
export const IconGlobe = (p: IconProps) => base({ ...p, children: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></> });
export const IconSearch = (p: IconProps) => base({ ...p, children: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.35-4.35" /></> });
export const IconChevron = ({ direction = "down", ...p }: IconProps & { direction?: "up" | "down" | "left" | "right" }) =>
  base({
    ...p,
    children: (
      <path
        d={
          direction === "up" ? "m6 15 6-6 6 6" : direction === "left" ? "m15 6-6 6 6 6" : direction === "right" ? "m9 6 6 6-6 6" : "m6 9 6 6 6-6"
        }
      />
    ),
  });
export const IconBell = (p: IconProps) => base({ ...p, children: <><path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z" /><path d="M10 19a2 2 0 0 0 4 0" /></> });
export const IconStar = (p: IconProps) => base({ ...p, children: <path d="m12 3 2.7 5.9 6.3.7-4.7 4.4 1.2 6.4L12 17.5 6.5 20.4l1.2-6.4-4.7-4.4 6.3-.7L12 3Z" /> });
export const IconNewspaper = (p: IconProps) => base({ ...p, children: <><rect x="3" y="5" width="14" height="14" rx="1.5" /><path d="M17 9h4v8a2 2 0 0 1-2 2H7" /><path d="M6.5 9h7M6.5 12h7M6.5 15h4" /></> });
export const IconFlame = (p: IconProps) => base({ ...p, children: <path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c1 1 2 2.5 2 4.5A5.5 5.5 0 0 1 6 20c0-2 .8-3 1.5-4-1.5.3-2.5 1.3-3 2.5C4 16 4.5 12 7 9.5 6.7 11 7 12 8 12c0-4 1-7 4-10Z" /> });

// Chart-toolbar icon set — replaces the raw text/emoji glyphs the toolbar
// used to render ("▤ ╱ ◢ ✛ — ⤢ ⤡"), same monochrome currentColor style as
// every icon above so the toolbar finally matches the rest of the app's
// already-migrated-off-emoji controls.
export const IconChartLine = (p: IconProps) => base({ ...p, children: <path d="M3 17l5-7 4 3 9-9" /> });
export const IconChartArea = (p: IconProps) =>
  base({
    ...p,
    children: (
      <>
        <path d="M3 20V17l5-7 4 3 9-9v16Z" fill="currentColor" fillOpacity="0.18" stroke="none" />
        <path d="M3 17l5-7 4 3 9-9" />
      </>
    ),
  });
export const IconCrosshair = (p: IconProps) => base({ ...p, children: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></> });
export const IconTrendLine = (p: IconProps) =>
  base({ ...p, children: <><path d="M5 19 19 5" /><circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none" /><circle cx="19" cy="5" r="1.6" fill="currentColor" stroke="none" /></> });
export const IconHorizontalLine = (p: IconProps) =>
  base({ ...p, children: <><path d="M3 12h18" /><circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none" /></> });
// "Fit to content" (reset zoom) — a tight viewfinder, distinct from Expand's
// diagonal arrows below so the two never get confused in the toolbar.
export const IconFit = (p: IconProps) => base({ ...p, children: <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" /> });
export const IconExpand = (p: IconProps) => base({ ...p, children: <path d="M14 4h6v6M4 20l7-7M10 20H4v-6M20 4l-7 7" /> });
export const IconCollapse = (p: IconProps) => base({ ...p, children: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> });
export const IconHistory = (p: IconProps) => base({ ...p, children: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></> });
export const IconSliders = (p: IconProps) => base({ ...p, children: <><path d="M4 6h6M14 6h6M4 12h10M18 12h2M4 18h13M21 18h-1" /><circle cx="10" cy="6" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="20" cy="18" r="2" /></> });
export const IconDots = (p: IconProps) => base({ ...p, children: <><circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" /></> });
export const IconShield = (p: IconProps) => base({ ...p, children: <><path d="M12 3l7 3v5.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6Z" /><path d="M9 12l2 2 4-4" /></> });
