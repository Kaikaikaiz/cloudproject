// Legacy entry point retained for local compatibility; no longer packaged for deployment.
import { createCloudApp } from './app.js';
import { createHandler } from './handler.js';
export const handler = createHandler(createCloudApp());
