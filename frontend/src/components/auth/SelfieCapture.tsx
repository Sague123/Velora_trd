import { useEffect, useRef, useState } from "react";
import { captureVideoFrame, compressImageToFit } from "../../lib/image";
import { IconCamera, IconClose } from "../icons/Icon";

/**
 * Live selfie capture. `getUserMedia` is the right tool — a photo taken now,
 * in front of the camera, is worth more than a file the user could have got
 * from anywhere — but it is also the most failure-prone API on this screen:
 * it needs a secure context, an available camera, and a permission the user
 * can refuse or have already refused permanently.
 *
 * So every one of those paths ends somewhere useful rather than in a dead
 * screen: the reason is named, and a plain file upload is always available as
 * a fallback. Never blocking on the camera is the whole point.
 */
export function SelfieCapture({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (dataUri: string | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Releasing the camera matters: a stream left open keeps the recording
  // indicator lit after the user has moved on, which is alarming and rightly so.
  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  }
  useEffect(() => stop, []);

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Браузер не поддерживает съёмку — загрузите фото файлом.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      setLive(true);
      // The <video> only exists once `live` is true, so attach on the next frame.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(
        name === "NotAllowedError"
          ? "Доступ к камере запрещён. Разрешите его в настройках браузера или загрузите фото файлом."
          : name === "NotFoundError"
            ? "Камера не найдена — загрузите фото файлом."
            : "Не удалось включить камеру — загрузите фото файлом."
      );
    }
  }

  function shoot() {
    if (!videoRef.current) return;
    try {
      onChange(captureVideoFrame(videoRef.current));
    } catch {
      setError("Не удалось сделать снимок");
    } finally {
      stop();
    }
  }

  if (value) {
    return (
      <div className="relative overflow-hidden rounded-lg border border-line bg-bg-2">
        <img src={value} alt="Селфи" className="max-h-56 w-full object-contain" />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="btn-fx absolute right-1.5 top-1.5 rounded-full bg-bg-0/80 p-1 text-txt-1 hover:text-sell"
          aria-label="Переснять"
        >
          <IconClose size={12} />
        </button>
      </div>
    );
  }

  return (
    <div>
      {live ? (
        <div className="overflow-hidden rounded-lg border border-line bg-bg-2">
          {/* Mirrored, because an unmirrored preview of your own face reads as
              wrong to everyone who has ever used a mirror. */}
          <video ref={videoRef} playsInline muted className="max-h-56 w-full -scale-x-100 object-contain" />
          <div className="flex gap-2 border-t border-line-soft p-2">
            <button
              type="button"
              onClick={shoot}
              className="tap-sm btn-fx flex-1 rounded-lg bg-accent-fill py-2 text-xs font-semibold text-white hover:brightness-110"
            >
              Сделать снимок
            </button>
            <button
              type="button"
              onClick={stop}
              className="tap-sm btn-fx rounded-lg border border-line px-3 py-2 text-xs text-txt-2 hover:text-txt-0"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          className="tap-sm btn-fx flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line bg-bg-2/40 px-3 py-8 text-2xs text-txt-2 hover:border-accent hover:text-txt-1"
        >
          <IconCamera size={20} />
          Включить камеру
        </button>
      )}

      {error && <div className="mt-1.5 text-2xs text-sell">{error}</div>}

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="mt-1.5 w-full text-center text-2xs text-txt-2 underline decoration-dotted hover:text-txt-0"
      >
        Загрузить фото файлом
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try { onChange(await compressImageToFit(file, 900, 700_000)); }
          catch { setError("Не удалось обработать файл"); }
        }}
      />
    </div>
  );
}
