import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';
import { emailValue, passwordValue } from '../src/lib/validation.js';
export async function seedAdmin() {
  const email = emailValue(process.env.ADMIN_EMAIL);
  const configuredHash = process.env.ADMIN_PASSWORD_HASH;
  if (configuredHash && !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(configuredHash))
    throw new Error('ADMIN_PASSWORD_HASH must be a valid scrypt hash.');
  const passwordHash =
    configuredHash || (await hashPassword(passwordValue(process.env.ADMIN_PASSWORD)));
  const name = process.env.ADMIN_NAME?.trim() || 'reLIVE Admin';
  const conflict = await prisma.user.findFirst({
    where: {
      OR: [
        { email, id: { not: 'relive-fixed-admin' } },
        { role: 'ADMIN', id: { not: 'relive-fixed-admin' } },
      ],
    },
  });
  if (conflict)
    throw new Error(
      'Admin configuration conflicts with an existing account. No account was changed.',
    );
  return prisma.user.upsert({
    where: { id: 'relive-fixed-admin' },
    create: { id: 'relive-fixed-admin', email, name, role: 'ADMIN', passwordHash },
    update: { email, name, role: 'ADMIN', passwordHash, tokenVersion: { increment: 1 } },
  });
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/prisma/seed.js')) {
  try {
    await seedAdmin();
    console.log('Fixed admin account seeded. Credentials are managed in backend .env.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
