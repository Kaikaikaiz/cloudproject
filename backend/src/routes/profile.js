import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { profileValues, publicUser, fail } from '../lib/validation.js';
const router = Router();
router.use(requireAuth);
router.patch('/', async (req, res) => {
  const values = profileValues(req.body || {});
  if (req.user.role === 'ADMIN' && values.email !== req.user.email)
    fail('The admin email is managed through backend seed configuration.');
  if (
    req.user.role !== 'ADMIN' &&
    values.email === process.env.ADMIN_EMAIL?.trim().toLowerCase()
  )
    fail('This email is reserved.', 409);
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: values,
    select: publicUser,
  });
  res.json({ user });
});
router.put('/image', async (req, res) => {
  const match =
    typeof req.body?.image === 'string' &&
    req.body.image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) fail('Choose a PNG, JPEG or WebP image.');
  const image = Buffer.from(match[2], 'base64');
  if (image.length > 700 * 1024 || image.length < 12)
    fail('Image must be smaller than 700 KB.');
  const valid =
    match[1] === 'png'
      ? image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : match[1] === 'jpeg'
        ? image[0] === 255 && image[1] === 216 && image[2] === 255
        : image.toString('ascii', 0, 4) === 'RIFF' &&
          image.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) fail('The image content does not match its file type.');
  const filename = randomUUID() + '.' + match[1];
  await mkdir(config.uploadsDir, { recursive: true });
  await writeFile(path.join(config.uploadsDir, filename), image, { flag: 'wx' });
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { profileImage: '/uploads/' + filename },
    select: publicUser,
  });
  res.json({ user });
});
export default router;
