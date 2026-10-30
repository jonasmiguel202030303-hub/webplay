export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, code = 'BAD_REQUEST', details) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Autenticação necessária.', code = 'UNAUTHORIZED') => new AppError(401, code, message);
export const paymentRequired = (message, code = 'SUBSCRIPTION_INACTIVE') => new AppError(402, code, message);
export const forbidden = (message = 'Você não tem permissão para esta ação.', code = 'FORBIDDEN') => new AppError(403, code, message);
export const notFound = (message = 'Recurso não encontrado.', code = 'NOT_FOUND') => new AppError(404, code, message);
export const conflict = (message, code = 'CONFLICT') => new AppError(409, code, message);
export const unprocessable = (message, code = 'UNPROCESSABLE', details) => new AppError(422, code, message, details);
export const tooMany = (message = 'Muitas tentativas. Aguarde e tente novamente.', code = 'RATE_LIMITED') => new AppError(429, code, message);
export const badGateway = (message, code = 'UPSTREAM_ERROR') => new AppError(502, code, message);

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
