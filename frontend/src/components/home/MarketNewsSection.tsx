import { useTranslation } from "react-i18next";
import { useMarketNews } from "../../hooks/useMarketNews";
import { LoadingRow } from "../common/States";
import { IconNewspaper } from "../icons/Icon";

function timeAgo(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * Real headlines via useMarketNews (CryptoCompare's public feed) when
 * reachable. If that fetch fails — network, CORS, upstream down — `data`
 * resolves to `null` and this renders an honest "not connected" state
 * instead of fabricating articles or breaking the page, exactly as asked:
 * the component itself is fully built and ready, only the data source can
 * be swapped (see useMarketNews.ts) without touching this file.
 */
export function MarketNewsSection() {
  const { t } = useTranslation();
  const { data, isLoading } = useMarketNews();

  return (
    <div className="anim-rise-3 rounded-lg border border-line bg-bg-1">
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-txt-2">
        <IconNewspaper size={13} /> {t("home.news")}
      </div>

      {isLoading && <LoadingRow />}

      {!isLoading && (!data || data.length === 0) && (
        <div className="px-3 py-4 text-center text-2xs text-txt-3">{t("home.newsNotConnected")}</div>
      )}

      {!isLoading && data && data.length > 0 && (
        <div className="divide-y divide-line-soft">
          {data.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-fx flex items-center gap-2.5 px-3 py-2 hover:bg-bg-2/60"
            >
              {a.imageUrl ? (
                <img src={a.imageUrl} alt="" className="h-10 w-14 shrink-0 rounded object-cover" loading="lazy" />
              ) : (
                <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded bg-bg-2 text-txt-3">
                  <IconNewspaper size={14} />
                </div>
              )}
              <div className="min-w-0">
                <div className="line-clamp-2 text-2xs font-medium leading-tight text-txt-0">{a.title}</div>
                <div className="mt-0.5 text-2xs text-txt-3">
                  {a.source} · {timeAgo(a.publishedAt)}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
