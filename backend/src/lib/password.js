import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function checkPassword(password, hash) {
  const [method, salt, value] = (hash || '').split('$');
  if (method !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/.test(value || '')) return false;
  const key = await derive(password, salt, 64);
  return timingSafeEqual(key, Buffer.from(value, 'hex'));
}
