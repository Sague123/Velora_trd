import { classNames } from "../../lib/format";
import { Tooltip } from "../common/Tooltip";
import { GRID_PRESETS, MARTINGALE_PRESETS, type PresetTone, type RiskKey } from "./presets";

const TONE_DOT: Record<PresetTone, string> = { buy: "bg-buy", warn: "bg-warn", sell: "bg-sell" };
const TONE_RING: Record<PresetTone, string> = {
  buy: "border-buy/70 bg-buy-soft/40",
  warn: "border-warn/70 bg-warn/10",
  sell: "border-sell/70 bg-sell-soft/40",
};

const NOT_ENFORCED = "Параметр пресета, который движок пока не исполняет: сетка всегда ставится с равномерным шагом, а стоп-лосса у ботов нет вообще. Показан, чтобы профили читались целиком, но на торговлю он не влияет.";

/** One `label: value` pair inside a card. `muted` marks a number the engine
 * doesn't act on — dimmed and flagged rather than dropped, so a profile still
 * reads as a whole without the page claiming a safety net that isn't wired up. */
function Spec({ label, value, tone, muted }: { label: string; value: string; tone?: "buy" | "sell"; muted?: boolean }) {
  const body = (
    <>
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-txt-3">
        {label}
        {muted && <span className="text-warn">*</span>}
      </div>
      <div
        className={classNames(
          "tabular text-2xs font-semibold",
          muted ? "text-txt-3 line-through decoration-txt-3/50" : tone === "buy" ? "text-buy" : tone === "sell" ? "text-sell" : "text-txt-0"
        )}
      >
        {value}
      </div>
    </>
  );
  return muted ? (
    <Tooltip label={NOT_ENFORCED}>
      <div className="cursor-help">{body}</div>
    </Tooltip>
  ) : (
    <div>{body}</div>
  );
}

function Card({
  label, blurb, tone, selected, onSelect, children,
}: {
  label: string;
  blurb: string;
  tone: PresetTone;
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={classNames(
        "btn-fx w-full rounded-lg border p-3 text-left transition-colors",
        selected ? TONE_RING[tone] : "border-line bg-bg-1 hover:border-line-soft hover:bg-bg-2/50"
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={classNames("h-2 w-2 shrink-0 rounded-full", TONE_DOT[tone])} />
        <span className="text-xs font-semibold text-txt-0">{label}</span>
        <span className="ml-auto truncate text-[9px] text-txt-3">{blurb}</span>
      </div>
      <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">{children}</div>
    </button>
  );
}

export function RiskProfileCards({
  botType, value, onChange,
}: {
  botType: "GRID" | "MARTINGALE";
  value: RiskKey;
  onChange: (key: RiskKey) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {botType === "GRID"
          ? GRID_PRESETS.map((p) => (
              <Card key={p.key} label={p.label} blurb={p.blurb} tone={p.tone} selected={value === p.key} onSelect={() => onChange(p.key)}>
                <Spec label="Диапазон" value={`±${p.rangePct}%`} />
                <Spec label="Levels" value={String(p.levels)} />
                {/* The engine spaces rungs arithmetically, so "Geometric" is
                    the one value here that describes an intention, not what
                    would actually run. */}
                <Spec label="Шаг" value={p.spacing} muted={p.spacing !== "Arithmetic"} />
                <Spec label="Leverage" value={`${p.leverage}x`} />
                <Spec label="Stop-Loss" value={`−${p.stopLossPct}%`} muted />
              </Card>
            ))
          : MARTINGALE_PRESETS.map((p) => (
              <Card key={p.key} label={p.label} blurb={p.blurb} tone={p.tone} selected={value === p.key} onSelect={() => onChange(p.key)}>
                <Spec label="Multiplier" value={`${p.multiplier}x`} />
                <Spec label="Safety orders" value={String(p.maxSafetyOrders)} />
                <Spec label="Deviation" value={`${p.deviationPct}%`} />
                <Spec label="Take Profit" value={`${p.takeProfitPct}%`} tone="buy" />
                <Spec label="Stop-Loss" value={`−${p.stopLossPct}%`} muted />
              </Card>
            ))}
      </div>
      <p className="mt-1.5 text-[9px] leading-snug text-txt-3">
        <span className="text-warn">*</span> — параметр пресета, который движок пока не исполняет (равномерный шаг сетки,
        стоп-лосса у ботов нет). Остальные значения подставляются в форму и реально уходят на сервер.
      </p>
    </div>
  );
}
