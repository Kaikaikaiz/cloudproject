import { mkdir } from 'node:fs/promises';
import { app } from './app.js';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { signToken } from './lib/jwt.js';
// Fail at startup rather than create an account without a usable session.
signToken('startup-config-check');
await mkdir(config.uploadsDir, { recursive: true });
await prisma.$connect();
const server = app.listen(config.port, '127.0.0.1', () => console.log(`reLIVE API ready at http://localhost:${config.port}`));
async function shutdown() {
 server.close(async () => { await prisma.$disconnect(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
