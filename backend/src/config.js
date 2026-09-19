import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const backendRoot = fileURLToPath(new URL('../', import.meta.url));
export const config = {
  port: Number(process.env.PORT || 4000),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  uploadsDir: path.join(backendRoot, 'uploads'),
};
