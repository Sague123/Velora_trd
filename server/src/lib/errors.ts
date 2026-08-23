export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}
export const badRequest = (code: string, m: string, d?: unknown) => new AppError(400, code, m, d);
export const unauthorized = (m = "Требуется авторизация") => new AppError(401, "UNAUTHORIZED", m);
export const forbidden = (m = "Недостаточно прав") => new AppError(403, "FORBIDDEN", m);
export const notFound = (m = "Не найдено") => new AppError(404, "NOT_FOUND", m);
export const conflict = (code: string, m: string) => new AppError(409, code, m);
