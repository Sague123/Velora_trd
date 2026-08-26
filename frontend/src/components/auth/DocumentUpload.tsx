import { useRef, useState } from "react";
import { compressImageToFit } from "../../lib/image";
import { classNames } from "../../lib/format";
import { IconCamera, IconClose } from "../icons/Icon";

/**
 * One document photo. The file is downscaled in the browser before it ever
 * reaches the network: a modern phone camera produces 6–12MB per shot, three
 * of those in one JSON body would be ~30MB of base64, and none of that extra
 * resolution helps someone read a document number.
 */
export function DocumentUpload({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (dataUri: string | null) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await compressImageToFit(file));
    } catch {
      setError("Не удалось обработать файл — попробуйте другое фото");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="mb-1 block text-2xs font-medium text-txt-2">{label}</span>

      {value ? (
        <div className="relative overflow-hidden rounded-lg border border-line bg-bg-2">
          <img src={value} alt={label} className="max-h-40 w-full object-contain" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="btn-fx absolute right-1.5 top-1.5 rounded-full bg-bg-0/80 p-1 text-txt-1 hover:text-sell"
            aria-label="Удалить фото"
          >
            <IconClose size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
          className={classNames(
            "tap-sm flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line bg-bg-2/40 px-3 py-6 text-2xs text-txt-2",
            "hover:border-accent hover:text-txt-1 disabled:opacity-40"
          )}
        >
          <IconCamera size={18} />
          {busy ? "Обработка…" : "Выбрать или сфотографировать"}
        </button>
      )}

      {hint && <div className="mt-1 text-2xs text-txt-3">{hint}</div>}
      {error && <div className="mt-1 text-2xs text-sell">{error}</div>}

      <input
        ref={input}
        type="file"
        accept="image/*"
        // On a phone this opens the camera directly rather than the gallery,
        // which is what someone photographing a document in front of them wants.
        capture="environment"
        className="hidden"
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }}
      />
    </div>
  );
}
