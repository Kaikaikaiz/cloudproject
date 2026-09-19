// The one browser-to-API boundary. Keep VITE_API_URL for deployed environments.
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(
  /\/$/,
  '',
);
export const imageUrl = (path) => (path ? new URL(path, API_URL).href : null);
const sessionToken = () => window.sessionStorage.getItem('relive_session_token');
export function setSessionToken(token) {
  if (token) window.sessionStorage.setItem('relive_session_token', token);
  else window.sessionStorage.removeItem('relive_session_token');
}
export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(API_URL + path, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken() ? { Authorization: 'Bearer ' + sessionToken() } : {}),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (cause) {
    const error = new Error(
      'Could not reach reLIVE. Check that the API is running and that this frontend origin is allowed.',
    );
    error.code = 'NETWORK_OR_CORS';
    error.cause = cause;
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    if (response.status === 401) {
      setSessionToken(null);
    }
    if (response.status === 401 && !['/auth/login', '/auth/me'].includes(path))
      window.dispatchEvent(new Event('relive:unauthorized'));
    throw error;
  }
  if (options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase()))
    window.dispatchEvent(new CustomEvent('relive:toast', { detail: { message: data.message || 'Saved successfully.' } }));
  return data;
}
