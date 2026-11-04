import {serverOrigin} from './config.js';

const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const configured = new URL(serverOrigin);
if (!local && configured.protocol !== 'https:') throw new Error('試験棚の接続先を確認してください。');
const endpoint = local ? location.origin : configured.origin;
const base = endpoint + '/api/vending';

export const byId = id => document.getElementById(id);

export function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function request({ownerKey, clientKey, data} = {}) {
  const headers = {Accept: 'application/json'};
  if (ownerKey) headers.Authorization = 'Bearer ' + ownerKey;
  if (clientKey) headers['X-Nanpure-Key'] = clientKey;
  if (data) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(base + (ownerKey ? '/admin' : ''), {
      method: data ? 'POST' : 'GET',
      body: data ? JSON.stringify(data) : undefined,
      headers,
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error'
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(typeof body.error === 'string' ? body.error : '試験棚に接続できませんでした。');
      error.status = response.status;
      throw error;
    }
    return body;
  } catch (error) {
    if (error instanceof TypeError || error.name === 'AbortError') {
      throw new Error('通信を確認し、時間をおいてもう一度お試しください。');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function showNotice(element, message, type = '') {
  element.className = type ? 'notice ' + type : 'notice';
  element.textContent = message;
}
