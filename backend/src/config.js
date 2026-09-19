import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const backendRoot = fileURLToPath(new URL('../', import.meta.url));
const localViteOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];
const configuredOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
export const config = {
  port: Number(process.env.PORT || 4000),
  // Development is intentionally limited to local Vite hosts. In production, set
  // ALLOWED_ORIGINS to a comma-separated list of trusted HTTPS frontend origins.
  allowedOrigins:
    process.env.NODE_ENV === 'production'
      ? configuredOrigins
      : [...new Set([...localViteOrigins, ...configuredOrigins])],
  uploadsDir: path.join(backendRoot, 'uploads'),
};
