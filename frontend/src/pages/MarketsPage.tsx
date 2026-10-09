import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTerminalStore } from "../store/terminal";
import { Page } from "../components/layout/Page";
import { InstrumentList } from "../components/markets/InstrumentList";

/**
 * The market list.
 *
 * This used to be a sortable table that fetched every instrument at once and
 * filtered them in the browser, with tabs keyed on the old four-value
 * category scale. Both stopped being workable when the catalogue grew: the
 * scale is now category plus market, and "every instrument at once" is a
 * download measured in megabytes before the first row paints.
 *
 * The browsing itself lives in InstrumentList, which the terminal's own
 * instrument picker shares — one list, one set of behaviours (tabs with
 * counts, spot/perp, server-side search, virtualised rows, favourites, a
 * stale marker), rather than two that drift.
 */
export function MarketsPage() {
  const { t } = useTranslation();
  const setSymbol = useTerminalStore((s) => s.setSymbol);
  const navigate = useNavigate();

  const open = (symbol: string) => {
    setSymbol(symbol);
    navigate("/terminal");
  };

  return (
    <Page>
      <h1 className="mb-3 text-sm font-semibold text-txt-0">{t("nav.markets")}</h1>
      <div className="rounded-xl border border-line bg-bg-1 p-3">
        <InstrumentList onPick={open} />
      </div>
    </Page>
  );
}
