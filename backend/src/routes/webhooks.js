import { Router } from 'express';
import { asyncHandler } from '../utils/errors.js';
import { webhookLimiter } from '../middleware/rateLimit.js';
import { handleMpWebhook } from '../services/billingService.js';

const router = Router();

// O Mercado Pago envia JSON; a autenticidade é garantida pela assinatura x-signature (HMAC), não por cookie.
router.post('/mercadopago', webhookLimiter(), asyncHandler(async (req, res) => {
  const result = await handleMpWebhook(req);
  res.status(result.status).json(result.body);
}));

export default router;
