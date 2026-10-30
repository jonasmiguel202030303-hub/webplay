import { AppError } from '../utils/errors.js';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', 'Rota não encontrada.'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Erro interno. Tente novamente em instantes.';
  let details;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Corpo da requisição inválido.';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Corpo da requisição muito grande.';
  } else if (err?.name === 'MulterError') {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR';
    message = err.code === 'LIMIT_FILE_SIZE' ? `Arquivo maior que o limite de ${Math.round(config.uploadMaxBytes / 1024)} KB.` : 'Falha no envio do arquivo.';
  }

  if (status >= 500) {
    logger.error('Erro não tratado', { id: req.id, method: req.method, path: req.path, error: err, stack: config.isProd ? undefined : err?.stack });
  }
  const body = { error: { code, message, ...(details ? { details } : {}) } };
  if (req.id) body.error.requestId = req.id;
  res.status(status).json(body);
}
