import { FormEvent, useState } from "react";
import { useKyc, useSubmitKyc } from "../../hooks/useKyc";
import { DocumentUpload } from "./DocumentUpload";
import { SelfieCapture } from "./SelfieCapture";
import { authButtonCls, authInputCls } from "./AuthShell";
import { classNames } from "../../lib/format";
import { ApiError } from "../../lib/api";
import type { KycDocumentType } from "../../lib/types";

/**
 * Identity verification in three steps — personal details, document, selfie.
 *
 * It lives in the profile's security settings and nowhere else. Verification is
 * optional — it gates withdrawals and savings, nothing else — so asking someone
 * to photograph a passport during registration would cost signups for a check
 * most people never need.
 */

export const IDENTITY_STEPS = ["Личные данные", "Документ", "Селфи"];

const DOC_TYPES: { value: KycDocumentType; label: string; needsBack: boolean }[] = [
  { value: "PASSPORT", label: "Паспорт", needsBack: false },
  { value: "ID_CARD", label: "ID-карта", needsBack: true },
  { value: "DRIVER_LICENSE", label: "Водительское удостоверение", needsBack: true },
];

export function IdentityForm({ onSubmitted, onCancel }: { onSubmitted: () => void; onCancel?: () => void }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);

  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [documentType, setDocumentType] = useState<KycDocumentType>("PASSPORT");
  const [documentNumber, setDocumentNumber] = useState("");
  const [documentFront, setDocumentFront] = useState<string | null>(null);
  const [documentBack, setDocumentBack] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);

  const kyc = useKyc();
  const submit = useSubmitKyc();
  const uploadsAvailable = kyc.data?.uploadAvailable !== false;
  const needsBack = DOC_TYPES.find((d) => d.value === documentType)?.needsBack ?? false;

  function go(next: number) {
    setError(null);
    setDetails([]);
    setStep(next);
  }

  async function send() {
    setError(null);
    setDetails([]);
    if (!documentFront || !selfie) return setError("Нужны фотографии документа и селфи");
    try {
      await submit.mutateAsync({
        fullName: fullName.trim(),
        address: address.trim(),
        documentType,
        documentNumber: documentNumber.trim(),
        documentFront,
        documentBack: documentBack ?? undefined,
        selfie,
      });
      onSubmitted();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        if (Array.isArray(e.details)) setDetails((e.details as any[]).map((d) => d.message));
      } else {
        setError("Не удалось отправить заявку");
      }
    }
  }

  const errorBlock = error && (
    <div className="mb-3 rounded border border-sell/40 bg-sell-soft px-2.5 py-1.5 text-2xs text-sell">
      {error}
      {details.length > 0 && <ul className="mt-1 list-disc pl-4">{details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
    </div>
  );

  const header = (
    <div className="mb-3 flex items-center justify-between">
      <span className="text-2xs font-medium text-txt-2">
        Шаг {step + 1} из {IDENTITY_STEPS.length} — {IDENTITY_STEPS[step]}
      </span>
      {onCancel && (
        <button type="button" onClick={onCancel} className="text-2xs text-txt-2 hover:text-txt-0">
          Отмена
        </button>
      )}
    </div>
  );

  const backButton = (to: number) => (
    <button type="button" onClick={() => go(to)} className="tap-sm mt-2 w-full text-center text-2xs text-txt-2 hover:text-txt-0">
      Назад
    </button>
  );

  if (step === 0) {
    return (
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); go(1); }}>
        {header}
        <p className="mb-3 text-2xs text-txt-2">
          Имя и адрес должны совпадать с документом, который вы загрузите на следующем шаге.
        </p>

        <label className="mb-3 block">
          <span className="mb-1 block text-2xs text-txt-2">Полное имя как в документе</span>
          <input
            required minLength={2} value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={authInputCls} placeholder="Иванов Иван Иванович"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-2xs text-txt-2">Адрес проживания</span>
          <textarea
            required minLength={5} rows={2} value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={`${authInputCls} resize-none`}
            placeholder="Город, улица, дом, квартира"
          />
        </label>

        {errorBlock}
        <button type="submit" className={authButtonCls}>Дальше</button>
      </form>
    );
  }

  if (step === 1) {
    return (
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); go(2); }}>
        {header}
        {!uploadsAvailable && (
          <div className="mb-3 rounded border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-2xs text-warn">
            Загрузка документов сейчас недоступна — хранилище не настроено. Вернитесь к проверке позже.
          </div>
        )}

        <span className="mb-1 block text-2xs text-txt-2">Тип документа</span>
        <div className="mb-3 flex flex-wrap gap-1 rounded-lg border border-line bg-bg-2/40 p-0.5">
          {DOC_TYPES.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => { setDocumentType(d.value); if (!d.needsBack) setDocumentBack(null); }}
              className={classNames(
                "tap-sm btn-fx flex-1 basis-0 rounded px-2 py-1.5 text-2xs font-medium",
                documentType === d.value ? "bg-accent-fill text-white" : "text-txt-2 hover:text-txt-0"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-2xs text-txt-2">Номер документа</span>
          <input
            required minLength={3} value={documentNumber}
            onChange={(e) => setDocumentNumber(e.target.value)}
            className={`${authInputCls} tabular`} placeholder="AB 1234567"
          />
        </label>

        <div className={classNames("mb-3 grid gap-3", needsBack ? "sm:grid-cols-2" : "grid-cols-1")}>
          <DocumentUpload
            label="Лицевая сторона"
            hint="Все четыре угла в кадре, без бликов"
            value={documentFront}
            onChange={setDocumentFront}
            disabled={!uploadsAvailable}
          />
          {needsBack && (
            <DocumentUpload
              label="Обратная сторона"
              value={documentBack}
              onChange={setDocumentBack}
              disabled={!uploadsAvailable}
            />
          )}
        </div>

        {errorBlock}
        <button
          type="submit"
          disabled={!documentFront || (needsBack && !documentBack) || documentNumber.trim().length < 3}
          className={authButtonCls}
        >
          Дальше
        </button>
        {backButton(0)}
      </form>
    );
  }

  return (
    <div>
      {header}
      <p className="mb-3 text-2xs text-txt-2">
        Сделайте фото лица при хорошем освещении, без очков и головного убора. Оно нужно, чтобы сверить вас с
        фотографией в документе.
      </p>

      <SelfieCapture value={selfie} onChange={setSelfie} />

      {errorBlock}

      <button onClick={send} disabled={!selfie || submit.isPending} className={`${authButtonCls} mt-3`}>
        {submit.isPending ? "Отправка…" : "Отправить на проверку"}
      </button>
      {backButton(1)}
    </div>
  );
}
