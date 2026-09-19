import { signToken, verifyToken } from './jwt.js';
export const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/api',
};
export function createSession(res, user) {
  const token = signToken(user.id, user.tokenVersion);
  const claims = verifyToken(token);
  res.cookie('relive_session', token, {
    ...cookieOptions,
    maxAge: (claims.exp - claims.iat) * 1000,
  });
  return token;
}
export function clearSession(res) {
  res.clearCookie('relive_session', cookieOptions);
}
