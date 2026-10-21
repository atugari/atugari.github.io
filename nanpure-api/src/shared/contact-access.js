export async function hashAccess(value) { const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(data), b => b.toString(16).padStart(2, '0')).join(''); }
export const validId = (v) => typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v);
export const contactStatus = { received: '受付済み', reading: '確認中', answered: '返答あり', closed: '対応完了' };
