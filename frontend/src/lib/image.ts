/** Resizes/crops an image file to a square JPEG data-URI, small enough to
 * fit comfortably under the server's avatar column cap (150KB) — there's no
 * file-storage service, so this stays a plain base64 string end to end. */
export function compressImageToSquare(file: File, size = 160, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas unavailable"));
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось прочитать изображение"));
    };
    img.src = url;
  });
}

/**
 * Downscales an image to fit inside `maxSide` and returns a JPEG data-URI,
 * stepping the quality down until it fits `maxBytes`.
 *
 * Identity documents go up as base64 in a JSON body, so size matters twice:
 * base64 inflates by a third, and three of these travel in one request. But a
 * document has to stay *readable* — a reviewer must be able to make out a
 * document number — so this compresses toward a budget rather than to a fixed
 * quality, and keeps the long edge generous.
 */
export async function compressImageToFit(
  file: File,
  maxSide = 1600,
  maxBytes = 1_400_000
): Promise<string> {
  const bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Не удалось прочитать изображение")); };
    img.src = url;
  });

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.85, 0.72, 0.6, 0.5, 0.4]) {
    const uri = canvas.toDataURL("image/jpeg", quality);
    // A data-URI's payload is base64, so bytes ≈ length × 3/4.
    if (uri.length * 0.75 <= maxBytes) return uri;
  }
  return canvas.toDataURL("image/jpeg", 0.35);
}

/** Grabs the current frame of a playing <video> as a JPEG data-URI. */
export function captureVideoFrame(video: HTMLVideoElement, maxSide = 900): string {
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}
