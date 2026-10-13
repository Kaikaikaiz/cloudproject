import express from 'express';
import cors from 'cors';
import { createContext } from './context.js';
import { createStore } from './store.js';
import { createImages } from './images.js';
export function createServiceApp({ registrars, services = Object.keys(registrars), store = createStore(), images = createImages(), origins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ 
    origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'], 
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.headers.origin && !origins.includes(req.headers.origin)) return res.status(403).json({ error: 'Request origin is not allowed.' });
    next();
  });
  app.use(express.json({ limit: '256kb' }));
  const context = createContext(store, images);
  for (const service of services) {
    if (!registrars[service]) throw new Error(`Unknown service ${service}`);
    registrars[service](app, context);
  }
  app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));
  app.use((error, _req, res, _next) => {
    const conditional = [
      'ConditionalCheckFailedException', 'TransactionConflictException'].includes(error.name) || 
      (error.name === 'TransactionCanceledException' && error.CancellationReasons?.some(reason => ['ConditionalCheckFailed', 'TransactionConflict'].includes(reason.Code)));
    const status = conditional ? 409 : error.status >= 400 && error.status < 500 ? error.status : 500;
    if (status >= 500){
      console.error(JSON.stringify({ 
        event: 'request_failed', 
        name: error.name, 
        requestId: error.$metadata?.requestId 
      }));
    }
    res.status(status).json({ 
      error: conditional ? 'The record changed or this email is already in use. Refresh and try again.' : status === 500 ? 'Something went wrong.' : error.message });
  });
  return app;
}
