import type { ReactNode } from "react";
import { classNames } from "../../lib/format";
import { SiteFooter } from "./SiteFooter";

/**
 * How wide a page's content column is allowed to get.
 *
 * Two widths, chosen by content density rather than by whatever each page
 * happened to pick: `wide` for tables and dashboards that genuinely use the
 * pixels, `narrow` for reading-and-forms screens where a full-width line is
 * just harder to scan. Before this there were five — 1700, 1600, 1200, 896
 * and none — one per page, none of them agreeing.
 */
const WIDTHS = {
  wide: "max-w-[1600px]",
  narrow: "max-w-4xl",
  full: "",
} as const;

export type PageWidth = keyof typeof WIDTHS;

/**
 * The wrapper every authenticated screen renders inside.
 *
 * It owns the things that were being re-decided page by page: the scroll
 * container, the padding, the content width and whether the footer shows.
 * `variant="app"` is the escape hatch for the two screens that are panelled
 * applications rather than documents — the terminal and admin manage their
 * own internal panes and scrolling, so this only supplies the frame.
 */
export function Page({
  children,
  width = "wide",
  variant = "document",
  footer = true,
  className,
}: {
  children: ReactNode;
  width?: PageWidth;
  /** `document` scrolls as one column; `app` fills the shell and never scrolls itself. */
  variant?: "document" | "app";
  footer?: boolean;
  className?: string;
}) {
  if (variant === "app") {
    return <div className={classNames("flex h-full min-h-0 flex-col", className)}>{children}</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className={classNames("mx-auto flex w-full flex-col p-3", WIDTHS[width], className)}>
        {children}
        {footer && <SiteFooter compact />}
      </div>
    </div>
  );
}
