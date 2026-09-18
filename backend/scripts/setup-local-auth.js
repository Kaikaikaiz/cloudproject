import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';
import { seedAdmin } from '../prisma/seed.js';

const envPath = new URL('../.env', import.meta.url);
let source;
try { source = await readFile(envPath, 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; source = await readFile(new URL('../.env.example', import.meta.url), 'utf8'); }
const values = parse(source);
function set(key, value) {
 const line = key + '=' + value;
 const pattern = new RegExp('^' + key + '=.*$', 'm');
 source = pattern.test(source) ? source.replace(pattern, () => line) : source.trimEnd() + '\n' + line + '\n';
 process.env[key] = value;
}
if (!values.JWT_SECRET || values.JWT_SECRET.length < 32 || values.JWT_SECRET.startsWith('replace-with-')) set('JWT_SECRET', randomBytes(48).toString('hex'));
set('ADMIN_EMAIL', values.ADMIN_EMAIL || 'admin@relive.local');
set('ADMIN_NAME', values.ADMIN_NAME || 'reLIVE Admin');
let generatedPassword;
if (values.ADMIN_PASSWORD) {
 set('ADMIN_PASSWORD_HASH', await hashPassword(values.ADMIN_PASSWORD));
} else if (!values.ADMIN_PASSWORD_HASH) {
 generatedPassword = randomBytes(18).toString('base64url');
 set('ADMIN_PASSWORD_HASH', await hashPassword(generatedPassword));
} else {
 process.env.ADMIN_PASSWORD_HASH = values.ADMIN_PASSWORD_HASH;
}
// Never persist the seed password in plaintext.
set('ADMIN_PASSWORD', '');
await writeFile(envPath, source);
try {
 await seedAdmin();
 console.log('Local authentication configured. Admin email: ' + process.env.ADMIN_EMAIL);
 if (generatedPassword) console.log('Generated admin password (save it now): ' + generatedPassword);
 else console.log('Admin seeded with the configured password hash.');
} finally { await prisma.$disconnect(); }

