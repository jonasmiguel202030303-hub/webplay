import { badRequest } from '../utils/errors.js';

/** Valida req[source] com um schema zod e grava o resultado em req.valid[source]. */
export const validate =
  (schema, source = 'body') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      const fields = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        if (!fields[key]) fields[key] = issue.message;
      }
      const first = Object.values(fields)[0];
      return next(badRequest(first || 'Dados inválidos.', 'VALIDATION_ERROR', { fields }));
    }
    req.valid = { ...(req.valid || {}), [source]: result.data };
    next();
  };
