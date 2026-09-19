import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { fail } from './validation.js';
export function validateImages(images, existing = []) {
  if (!Array.isArray(images) || images.length > 5)
    fail('Choose no more than five listing images.');
  const seen = new Set();
  return images.map((image) => {
    if (typeof image !== 'string') fail('Invalid listing image.');
    if (image.startsWith('/uploads/')) {
      if (!existing.includes(image) || seen.has(image))
        fail('Only this listing’s existing images may be retained, without duplicates.');
      seen.add(image);
      return { url: image };
    }
    const match = image.match(
      /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/,
    );
    if (!match) fail('Images must be PNG, JPEG or WebP.');
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 2 * 1024 * 1024 || buffer.length < 12)
      fail('Each listing image must be at most 2 MB.');
    const valid =
      match[1] === 'png'
        ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : match[1] === 'jpeg'
          ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
          : buffer.toString('ascii', 0, 4) === 'RIFF' &&
            buffer.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) fail('An image does not match its file type.');
    return { buffer, extension: match[1] };
  });
}
export async function removeImages(urls) {
  for (const url of urls) {
    // Only generated listing assets inside the configured uploads folder.
    if (!/^\/uploads\/listing-[a-f0-9-]+\.(png|jpeg|webp)$/.test(url)) continue;
    try {
      await unlink(path.join(config.uploadsDir, path.basename(url)));
    } catch (error) {
      if (error.code !== 'ENOENT')
        console.error('Could not remove an unused listing image:', error.code);
    }
  }
}
export async function saveImages(images) {
  const added = [];
  const urls = [];
  try {
    await mkdir(config.uploadsDir, { recursive: true });
    for (const image of images) {
      if (image.url) {
        urls.push(image.url);
        continue;
      }
      const filename = 'listing-' + randomUUID() + '.' + image.extension;
      await writeFile(path.join(config.uploadsDir, filename), image.buffer, {
        flag: 'wx',
      });
      const url = '/uploads/' + filename;
      added.push(url);
      urls.push(url);
    }
    return { urls, added };
  } catch (error) {
    await removeImages(added);
    throw error;
  }
}
