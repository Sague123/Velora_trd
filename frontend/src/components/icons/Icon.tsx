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
// IconBot is defined further down, in the solid-glyph section (was the old
// robot-body line icon; now the pasted-in AI mark — same name, same call
// sites, just a cleaner glyph).
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

// Solid glyphs: a small set of filled (not stroked) icons for spots that
// want a heavier, more literal mark than the line set above — direction
// (bull/bear) on the Buy/Sell buttons, a few tab/label icons swapped for a
// closer semantic match. `solid()` mirrors `base()`'s scaffold (24x24
// viewBox, same `size` prop) but fills with currentColor instead of
// stroking, so these still inherit theme/text color like every other icon —
// just rendered as silhouettes rather than outlines.
function solid({ size = 15, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" {...rest}>
      {children}
    </svg>
  );
}
export const IconBullMarket = (p: IconProps) =>
  solid({ ...p, children: <path d="m18 12c-3.314 0-6 2.686-6 6s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6zm1 6v3h-2v-3h-2.454l2.687-2.687c.417-.417 1.093-.417 1.51 0l2.688 2.687zm-12-2c-.796 0-1.535.24-2.158.642l-2.842-7.459c0-.387-.002-.762.018-1.184h1.982c.364 0 .709.075 1.032.194-.021.099-.032.201-.032.306 0 .828.672 1.5 1.5 1.5.105 0 .207-.011.306-.032.119.323.194.668.194 1.032v5zm8-7.5c0-.105-.011-.207-.032-.306.323-.119.668-.194 1.032-.194h1.982c.02.421.018.797.018 1.184l-.317.832c-1.769.07-3.39.707-4.683 1.744v-.76c0-.364.075-.709.194-1.032.099.021.201.032.306.032.828 0 1.5-.672 1.5-1.5zm-5 9.5c0 1.459.397 2.822 1.079 4h-4.079c-1.105 0-2-.895-2-2s.895-2 2-2zm-7.097-13.01c-1.609-.052-2.903-1.369-2.903-2.99v-2h2v2c0 .552.449 1 1 1h14c.551 0 1-.448 1-1v-2h2v2c0 1.621-1.295 2.938-2.903 2.99.223.325.397.663.523 1.01h-1.62c-2.757 0-5 2.243-5 5v3.13c-.322.582-.568 1.211-.738 1.87h-1.262v-5c0-2.757-2.243-5-5-5h-1.62c.126-.346.3-.685.523-1.01z" /> });
export const IconBearMarket = (p: IconProps) =>
  solid({ ...p, children: <path d="m9.228 19.427c.358 1.543 1.132 2.926 2.204 4.02l-.432.185c-.876-.368-8.17-3.425-11-8.499v-5.405l1.097-1.862c-.485-.828-1.097-2.091-1.097-3.198 0-2.574 2.093-4.668 4.667-4.668 1.216 0 2.388.525 3.264 1.423 1.925-.562 4.214-.562 6.139 0 .876-.897 2.048-1.423 3.264-1.423 2.47 0 4.477 1.934 4.636 4.364.166 1.193-.55 2.595-1.066 3.501l1.097 1.862v.571c-1.144-.717-2.468-1.167-3.892-1.268l-.751-1.275.563-.792c.51-.722 1.08-1.843 1.08-2.297 0-.919-.748-1.667-1.667-1.667-.663 0-1.189.51-1.438.946l-.665 1.164-1.231-.53c-1.784-.77-4.214-.77-5.998 0l-1.231.53-.665-1.164c-.249-.437-.775-.946-1.438-.946-.919 0-1.667.748-1.667 1.667 0 .445.57 1.58 1.08 2.297l.563.792-1.643 2.79v3.753c1.433 2.176 4.216 4.005 6.228 5.128zm-3.228-9.927c0 .828.672 1.5 1.5 1.5s1.5-.672 1.5-1.5-.672-1.5-1.5-1.5-1.5.672-1.5 1.5zm8.5-1.5c-.828 0-1.5.672-1.5 1.5s.672 1.5 1.5 1.5 1.5-.672 1.5-1.5-.672-1.5-1.5-1.5zm9.5 9.5c0 3.59-2.91 6.5-6.5 6.5s-6.5-2.91-6.5-6.5c0-1.147.299-2.222.82-3.157-.24.096-.513.157-.82.157-1.289 0-2-1.025-2-1.55s.711-.95 2-.95c1.191 0 1.882.365 1.98.835 1.17-1.134 2.762-1.835 4.52-1.835 3.59 0 6.5 2.91 6.5 6.5zm-2 .5h-3v-4h-3v4h-3l3.793 3.707c.391.39 1.024.39 1.414 0z" /> });
// Replaces IconBot's old literal robot-body glyph everywhere a "this is
// algo/bot-driven" mark is used (order badges, the bots status pill, the
// Strategies nav icon) — same slot, a cleaner AI mark.
export const IconBot = (p: IconProps) =>
  solid({ ...p, children: <path d="m19.026,12v6c0,.552-.448,1-1,1s-1-.448-1-1v-6c0-.552.448-1,1-1s1,.448,1,1Zm-7.42-5.283l3.071,11.029c.175.63-.298,1.254-.953,1.254-.443,0-.831-.294-.952-.72l-.643-2.28h-5.206l-.643,2.28c-.12.426-.509.72-.952.72h0c-.654,0-1.128-.624-.953-1.254l3.091-11.108c.141-.608.541-1.12,1.098-1.405.568-.292,1.22-.31,1.839-.05.587.246,1.037.817,1.204,1.535Zm-.041,7.283l-1.929-6.835c-.029-.114-.191-.114-.219,0l-1.929,6.835h4.077Zm11.462-4c-.552,0-1,.448-1,1v8c0,1.654-1.346,3-3,3H5.026c-1.654,0-3-1.346-3-3V5c0-1.654,1.346-3,3-3h8c.552,0,1-.448,1-1S13.578,0,13.026,0H5.026C2.269,0,.026,2.243.026,5v14c0,2.757,2.243,5,5,5h14c2.757,0,5-2.243,5-5v-8c0-.552-.448-1-1-1Zm-6.85-4.82l1.868.787.745,1.865c.161.404.552.668.987.668s.825-.265.987-.668l.741-1.854,1.854-.741c.404-.161.668-.552.668-.987s-.265-.825-.668-.987l-1.854-.741-.741-1.854C20.601.265,20.21,0,19.776,0s-.825.265-.987.668l-.737,1.843-1.84.697c-.406.154-.678.54-.686.974-.008.435.25.83.65.999Z" /> });
export const IconOrderHistory = (p: IconProps) =>
  solid({ ...p, children: <path d="M22.335,13.833c-.612,2.453-2.807,4.167-5.335,4.167H7.188c-1.747,0-3.239-1.306-3.469-3.037L2.182,3.434c-.033-.247-.246-.434-.496-.434h-.187c-.829,0-1.5-.672-1.5-1.5S.671,0,1.5,0h.187c1.747,0,3.239,1.306,3.469,3.037l.262,1.963h5.083c.829,0,1.5,.672,1.5,1.5s-.671,1.5-1.5,1.5H5.817l.875,6.566c.033,.247,.246,.434,.496,.434h9.812c1.149,0,2.146-.778,2.425-1.894,.2-.804,1.012-1.294,1.818-1.092,.804,.2,1.293,1.015,1.092,1.818Zm1.665-8.833c0,2.761-2.239,5-5,5s-5-2.239-5-5S16.239,0,19,0s5,2.239,5,5Zm-3,.586l-1-1v-1.586c0-.552-.448-1-1-1h0c-.552,0-1,.448-1,1v2c0,.265,.105,.52,.293,.707l1.293,1.293c.391,.39,1.024,.39,1.414,0,.391-.391,.391-1.024,0-1.414ZM7,20c-1.105,0-2,.895-2,2s.895,2,2,2,2-.895,2-2-.895-2-2-2Zm10,0c-1.105,0-2,.895-2,2s.895,2,2,2,2-.895,2-2-.895-2-2-2Z" /> });
export const IconListView = (p: IconProps) =>
  solid({
    ...p,
    children: (
      <>
        <path d="M8,7H22.5a1.5,1.5,0,0,0,0-3H8A1.5,1.5,0,0,0,8,7Z" />
        <path d="M22.5,11H8a1.5,1.5,0,0,0,0,3H22.5a1.5,1.5,0,0,0,0-3Z" />
        <path d="M22.5,18H8a1.5,1.5,0,0,0,0,3H22.5a1.5,1.5,0,0,0,0-3Z" />
        <circle cx="2.5" cy="5.5" r="2.5" />
        <circle cx="2.5" cy="12" r="2.5" />
        <circle cx="2.5" cy="19" r="2.5" />
      </>
    ),
  });
export const IconMeter = (p: IconProps) =>
  solid({ ...p, children: <path d="m12,0C5.383,0,0,5.383,0,12s5.383,12,12,12,12-5.383,12-12S18.617,0,12,0Zm0,21c-4.963,0-9-4.037-9-9S7.037,3,12,3s9,4.038,9,9-4.037,9-9,9ZM6,7h3v5h-3v-5Zm4.5,0h3v5h-3v-5Zm4.5,0h3v5h-3v-5Z" /> });
export const IconSearchDollar = (p: IconProps) =>
  solid({ ...p, children: <path d="M23.957,22.543l-6.219-6.219c1.412-1.725,2.262-3.927,2.262-6.324C20,4.486,15.514,0,10,0S0,4.486,0,10s4.486,10,10,10c2.397,0,4.599-.85,6.324-2.262l6.219,6.219,1.414-1.414Zm-13.957-4.543c-4.411,0-8-3.589-8-8S5.589,2,10,2s8,3.589,8,8-3.589,8-8,8Zm-2-10.021c0,.379,.271,.698,.644,.761l3.041,.507c1.341,.223,2.315,1.372,2.315,2.732,0,1.654-1.346,3-3,3v1h-2v-1c-1.654,0-3-1.346-3-3h2c0,.552,.449,1,1,1h2c.551,0,1-.448,1-1,0-.378-.292-.697-.665-.76l-3.021-.507c-1.341-.224-2.315-1.374-2.315-2.733,0-1.654,1.346-3,3-3v-1h2v1c1.654,0,3,1.346,3,3h-2c0-.552-.449-1-1-1h-2c-.551,0-1,.448-1,1Z" /> });
export const IconBookOpenCover = (p: IconProps) =>
  solid({
    ...p,
    children: (
      <>
        <path d="M12,24c-.555,0-1.109-.077-1.648-.231l-6.726-1.921c-2.135-.61-3.626-2.587-3.626-4.808V4c0-.552,.448-1,1-1s1,.448,1,1v13.04c0,1.333,.895,2.519,2.176,2.885l6.726,1.921c.719,.205,1.478,.205,2.198,0l6.725-1.921c1.281-.366,2.176-1.552,2.176-2.885V3c0-.552,.448-1,1-1s1,.448,1,1v14.04c0,2.22-1.491,4.197-3.626,4.808l-6.726,1.921c-.54,.154-1.094,.231-1.648,.231Z" />
        <path d="M18.023,.155c-.728-.269-1.539-.202-2.26,.086l-.877,.35c-1.139,.455-1.887,1.559-1.887,2.786v14.496c-.328,.084-.663,.127-1,.127s-.672-.043-1-.127V3.377c0-1.227-.747-2.331-1.887-2.786l-.878-.351c-.721-.288-1.532-.355-2.26-.085-1.215,.45-1.976,1.583-1.976,2.822V15.691c0,1.339,.888,2.516,2.175,2.884l4.176,1.194c.538,.153,1.093,.23,1.648,.23s1.11-.077,1.648-.23l4.176-1.194c1.288-.368,2.175-1.545,2.175-2.884V2.977c0-1.239-.762-2.373-1.977-2.822Z" />
      </>
    ),
  });
