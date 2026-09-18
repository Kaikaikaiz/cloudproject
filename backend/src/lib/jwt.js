import jwt from 'jsonwebtoken';
function secret() {
 const value = process.env.JWT_SECRET;
 if (!value || value.length < 32 || value.startsWith('replace-with-')) throw new Error('Set JWT_SECRET to a random secret of at least 32 characters before enabling authentication.');
 return value;
}
export function signToken(userId, version = 0) {
 return jwt.sign({ version }, secret(), { subject: userId, algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '7d', issuer: 'relive-api', audience: 'relive-web' });
}
export function verifyToken(token) {
 return jwt.verify(token, secret(), { algorithms: ['HS256'], issuer: 'relive-api', audience: 'relive-web' });
}
