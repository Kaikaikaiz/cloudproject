import 'dotenv/config';
import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Some Windows Prisma engines fail to initialize a missing SQLite file.
// Exclusive creation preserves any existing database and its contents.
const url = process.env.DATABASE_URL;
if (!url?.startsWith('file:'))
  throw new Error(
    'DATABASE_URL must be a SQLite file: URL. Copy .env.example to .env first.',
  );
const schemaDirectory = fileURLToPath(new URL('../prisma/', import.meta.url));
const databasePath = path.resolve(schemaDirectory, url.slice(5));
await mkdir(path.dirname(databasePath), { recursive: true });
try {
  const file = await open(databasePath, 'wx');
  await file.close();
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
