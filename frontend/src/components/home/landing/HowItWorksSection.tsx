import { useTranslation } from "react-i18next";
import registerShot from "../../../assets/landing/ui-register.png";
import kycShot from "../../../assets/landing/ui-kyc.png";
import depositShot from "../../../assets/landing/ui-deposit.png";
import terminalShot from "../../../assets/landing/ui-terminal.png";

const STEPS = [
  { titleKey: "home.landing.step1Title", bodyKey: "home.landing.step1Body", img: registerShot, altKey: "home.landing.step1Alt", pos: "object-top", w: 447, h: 575 },
  // kyc's source is a wide, short settings row (873x122) — object-cover fills
  // the thumbnail's height first, so most of that width gets cropped no
  // matter what; object-left keeps the title/badge (the useful part) in
  // frame instead of the centered description text.
  { titleKey: "home.landing.step2Title", bodyKey: "home.landing.step2Body", img: kycShot, altKey: "home.landing.step2Alt", pos: "object-left", w: 873, h: 122 },
  { titleKey: "home.landing.step3Title", bodyKey: "home.landing.step3Body", img: depositShot, altKey: "home.landing.step3Alt", pos: "object-top", w: 383, h: 320 },
  { titleKey: "home.landing.step4Title", bodyKey: "home.landing.step4Body", img: terminalShot, altKey: "home.landing.step4Alt", pos: "object-left", w: 1600, h: 945 },
] as const;

/**
 * A horizontal strip, not a card — the third distinct composition on this
 * page (Automated Trading is a framed product shot, Security is a plain
 * text band, this is a numbered filmstrip of the actual account flow). Each
 * step is a real crop of that exact screen — sign up, then KYC, then
 * deposit, then the terminal itself — instead of four numbered circles with
 * nothing to look at, which is what made this section read as the most
 * text-heavy one on the page before.
 */
export function HowItWorksSection() {
  const { t } = useTranslation();

  return (
    <section className="anim-rise-2">
      <h2 className="text-lg font-bold text-txt-0 sm:text-xl">{t("home.landing.howItWorksTitle")}</h2>
      <ol className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        {STEPS.map((s, i) => (
          <li key={s.titleKey} className="min-w-0">
            {/* Number sits beside the caption, not overlaid on the image —
                every crop anchors its own real content differently (a title
                top-left, a badge top-right), and a fixed overlay position
                was guaranteed to collide with one of them sooner or later. */}
            <div className="overflow-hidden rounded-lg border border-line-soft">
              <img src={s.img} alt={t(s.altKey)} width={s.w} height={s.h} className={`h-36 w-full object-cover ${s.pos}`} />
            </div>
            <div className="mt-2.5 flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent/50 text-3xs font-bold text-accent">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-txt-0">{t(s.titleKey)}</div>
                <div className="mt-0.5 text-xs text-txt-2">{t(s.bodyKey)}</div>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
