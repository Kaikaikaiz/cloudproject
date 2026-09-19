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
export async function seedDemoData() {
  const passwordHash = await hashPassword('relive-demo-password');
  const people = [
    ['nur-aisyah@relive.demo', 'Nur Aisyah', 'Kuala Lumpur', 'Bangsar', 85000],
    ['daniel-tan@relive.demo', 'Daniel Tan', 'Selangor', 'Petaling Jaya', 125000],
    ['kavitha-r@relive.demo', 'Kavitha Raj', 'Penang', 'George Town', 67000],
  ];
  const users = [];
  for (const [email, name, state, city, walletBalance] of people) {
    users.push(await prisma.user.upsert({
      where: { email },
      create: { email, name, state, city, walletBalance, passwordHash, role: 'USER' },
      update: { name, state, city, walletBalance, passwordHash, role: 'USER' },
    }));
  }
  const listings = [
    [0, 'Mid-century teak side table', 'A warm solid-teak side table with a small drawer and gentle signs of a well-loved home.', 18500, 'Home & Living', 'Good', 'Kuala Lumpur', 'Bangsar', 'ACTIVE'],
    [1, 'Fujifilm Instax Mini 11', 'Pastel blue instant camera, tested and working. Includes a soft case and fresh batteries.', 22000, 'Electronics', 'Like New', 'Selangor', 'Petaling Jaya', 'ACTIVE'],
    [2, 'Batik weekend tote', 'Handmade batik cotton tote with a lined interior. Lightly used for weekend markets.', 6800, 'Fashion', 'Good', 'Penang', 'George Town', 'ACTIVE'],
    [0, 'Set of SPM reference books', 'Five clean revision books for Form 5 science and maths, with a few highlighted notes.', 4500, 'Books & Education', 'Fair', 'Kuala Lumpur', 'Bangsar', 'SOLD'],
    [1, 'Yoga mat and cork blocks', 'Non-slip mat with two cork blocks. Needs a new home after a studio clear-out.', 9000, 'Sports & Hobbies', 'Good', 'Selangor', 'Petaling Jaya', 'NEEDS_REVISION'],
  ];
  for (const [owner, title, description, price, category, condition, state, city, status] of listings) {
    const exists = await prisma.listing.findFirst({ where: { sellerId: users[owner].id, title } });
    if (!exists) await prisma.listing.create({ data: { sellerId: users[owner].id, title, description, price, category, condition, state, city, status, moderationReason: status === 'NEEDS_REVISION' ? 'Please add a clearer photo of the item condition.' : null } });
  }
  return users;
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/prisma/seed.js')) {
  try {
    await seedAdmin();
    await seedDemoData();
    console.log('Fixed admin account and Malaysian demo marketplace data seeded.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
