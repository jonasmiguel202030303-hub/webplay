import { badRequest } from './errors.js';

/** Converte um parâmetro de rota em inteiro positivo ou responde 400. */
export function idParam(req, name = 'id') {
  const value = Number.parseInt(req.params[name], 10);
  if (!Number.isInteger(value) || value <= 0 || String(value) !== String(req.params[name])) throw badRequest('Identificador inválido.', 'INVALID_ID');
  return value;
}
