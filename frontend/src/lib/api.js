export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
export const imageUrl = path => path ? new URL(path, API_URL).href : null;
export async function api(path, options = {}) {
 let response;
 try { response = await fetch(API_URL + path, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options.headers }, body: options.body === undefined ? undefined : JSON.stringify(options.body) }); }
 catch { throw new Error('Could not reach reLIVE. Please check your connection and try again.'); }
 const data = await response.json().catch(() => ({}));
 if (!response.ok) {
  const error = new Error(data.error || 'Something went wrong. Please try again.');
  error.status = response.status;
  if (response.status === 401 && !['/auth/login','/auth/me'].includes(path)) window.dispatchEvent(new Event('relive:unauthorized'));
  throw error;
 }
 return data;
}
