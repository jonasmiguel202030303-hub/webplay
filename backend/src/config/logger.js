import { config } from './env.js';
import { createLogger } from '../utils/logger.js';

export const logger = createLogger(config.logLevel);
