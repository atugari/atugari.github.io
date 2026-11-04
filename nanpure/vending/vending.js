import {byId, request, showNotice, token} from './api.js';
import {savePuzzles} from './notebook.js';

const clientStorage = 'nanpure-vending-client-v1';
const draftStorage = 'nanpure-vending-pending-v1';
const savedStorage = 'nanpure-vending-saved-v1';
const available = byId('available');
const quantity = byId('quantity');
const take = byId('take-now');
const reserve = byId('reserve');
const notice = byId('notice');
const ordersList = byId('orders');
const refreshButton = byId('refresh');
const orderDate = new Intl.DateTimeFormat('ja-JP', {timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'});
let shelf;
let orders = [];
let busy = false;

function readObject(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

function clientKey(create = false) {
  let key = localStorage.getItem(clientStorage);
  if (!key && create) {
    key = token();
    localStorage.setItem(clientStorage, key);
  }
  return key;
}

function pending() {
  const order = readObject(draftStorage, null);
  return order && /^[a-f0-9]{64}$/.test(order.id) && Number.isInteger(order.count) &&
    order.count >= 1 && order.count <= 10 && typeof order.reserve === 'boolean' ? order : null;
}

function count() {
  const value = quantity.valueAsNumber;
  return Number.isInteger(value) && value >= 1 && value <= 10 ? value : 0;
}

function updateButtons() {
  const draft = pending();
  const want = count();
  const stock = shelf?.available;
  const now = Math.min(stock ?? 0, want);
  byId('request-form').hidden = Boolean(draft);
  byId('pending-request').hidden = !draft;
  byId('retry-order').disabled = busy;
  quantity.disabled = busy;
  take.disabled = busy || !now;
  take.hidden = stock === 0;
  reserve.disabled = busy || stock === undefined || !want;
  reserve.className = stock === 0 ? 'primary' : 'secondary';
  reserve.hidden = stock !== undefined && stock > 0 && (!want || now === want);
  take.textContent = now ? now + '問を受け取る' : '受け取る';
  reserve.textContent = now && want > now ? now + '問を受け取り、残り' + (want - now) + '問を予約' :
    want ? want + '問を予約する' : '予約する';
  refreshButton.disabled = busy;
  for (const button of ordersList.querySelectorAll('button')) button.disabled = busy;
}

function render() {
  available.textContent = shelf?.available ?? '—';
  ordersList.replaceChildren();
  byId('orders-empty').hidden = orders.length > 0;
  const saved = readObject(savedStorage, {});
  for (const order of orders) {
    const item = document.createElement('li');
    item.dataset.orderId = order.id;
    const detail = document.createElement('div');
    detail.className = 'record-copy';
    const title = document.createElement('strong');
    title.textContent = order.cancelled ? '残りの申し込みを取り消しました' :
      order.ready > 0 ? order.ready + '問を受け取れます' :
      order.waiting > 0 ? '補充を待っています' : '受け取り済み';
    const status = document.createElement('span');
    status.textContent = order.count + '問のうち ' + order.received + '問受け取り済み' +
      (order.waiting > 0 ? ' ・ ' + order.waiting + '問待ち' : '');
    if (!order.cancelled && order.ready + order.waiting > 0 && Number.isFinite(order.expires)) {
      status.textContent += ' ・ ' + orderDate.format(order.expires) + 'まで';
    } else if (Number.isFinite(order.created)) {
      status.textContent += ' ・ ' + orderDate.format(order.created);
    }
    detail.append(title, status);
    item.append(detail);
    const actions = document.createElement('div');
    actions.className = 'actions record-actions';
    const needsRecovery = order.received > (saved[order.id] || 0);
    if (order.ready > 0 || needsRecovery) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary';
      button.dataset.action = 'collect';
      button.textContent = order.ready > 0 ? '受け取る' : '問題帳への保存を再試行';
      button.addEventListener('click', () => run(async () => { await collect(order.id); }));
      actions.append(button);
    }
    if (!order.cancelled && order.ready + order.waiting > 0) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'text-button';
      button.dataset.action = 'cancel';
      button.textContent = '残りを取り消す';
      button.addEventListener('click', () => {
        if (!confirm('まだ受け取っていない分の申し込みを取り消しますか？')) return;
        return run(async () => {
          await request({clientKey: clientKey(), data: {action: 'cancel', id: order.id}});
          showNotice(notice, '残りの申し込みを取り消しました。', 'success');
        });
      });
      actions.append(button);
    }
    if (actions.childElementCount) item.append(actions);
    ordersList.append(item);
  }
  updateButtons();
}

async function refresh() {
  const result = await request({clientKey: clientKey()}).catch(error => {
    if (error.status === 503) {
      shelf = undefined;
      render();
    }
    throw error;
  });
  if (!result.enabled || !Number.isInteger(result.shelf?.available)) {
    shelf = undefined;
    render();
    throw new Error('試験棚は準備中です。');
  }
  shelf = result.shelf;
  orders = Array.isArray(result.orders) ? result.orders : [];
  // Keep the same identifier on retry if the previous response was lost.
  const draft = pending();
  if (draft && orders.some(order => order.id === draft.id)) localStorage.removeItem(draftStorage);
  render();
}

async function collect(id) {
  showNotice(notice, '受け取った問題を、この端末の問題帳に保存しています…');
  const result = await request({clientKey: clientKey(), data: {action: 'collect', id}});
  const {saved, total} = await savePuzzles(result.puzzles);
  const stored = readObject(savedStorage, {});
  delete stored[id];
  stored[id] = total;
  localStorage.setItem(savedStorage, JSON.stringify(Object.fromEntries(Object.entries(stored).slice(-100))));
  const order = result.order;
  const waiting = order?.waiting > 0 ? ' 残り' + order.waiting + '問は補充待ちです。' : '';
  if (total > 0) byId('open-notebook').hidden = false;
  const message = saved > 0 ? saved + '問を問題帳に保存しました。' :
    total > 0 ? '受け取った問題はすでに問題帳にあります。' : '受け取れる問題はまだありません。';
  showNotice(notice, message + waiting, saved > 0 ? 'success' : '');
}

async function submitOrder(draft) {
  const key = clientKey(true);
  localStorage.setItem(draftStorage, JSON.stringify(draft));
  updateButtons();
  let result;
  try {
    result = await request({clientKey: key, data: {action: 'order', ...draft}});
  } catch (error) {
    if (error.status === 409 && !draft.reserve) localStorage.removeItem(draftStorage);
    throw error;
  }
  if (result.order?.id !== draft.id) throw new Error('申し込み結果を確認できませんでした。');
  localStorage.removeItem(draftStorage);
  if (result.order.ready > 0) {
    await collect(draft.id);
  } else {
    const waiting = result.order.waiting;
    showNotice(notice, waiting > 0 ? waiting + '問の予約を受け付けました。' : '申し込み状況を確認しました。', 'success');
  }
}

async function run(action, refreshAfter = true) {
  if (busy) return;
  busy = true;
  updateButtons();
  try {
    if (navigator.locks?.request) await navigator.locks.request('nanpure-vending-actions-v1', action);
    else await action();
  } catch (error) {
    showNotice(notice, error.message || '操作を完了できませんでした。', 'error');
  } finally {
    try { if (refreshAfter) await refresh(); }
    catch (error) {
      if (!notice.textContent || notice.textContent.endsWith('…')) showNotice(notice, error.message, 'error');
    }
    busy = false;
    updateButtons();
  }
}

function begin(wantsReservation) {
  const requested = count();
  if (!quantity.reportValidity() || !requested) return;
  return run(async () => {
    const draft = pending();
    if (draft) return submitOrder(draft);
    showNotice(notice, '申し込みを確認しています…');
    return submitOrder({id: token(), count: requested, reserve: wantsReservation});
  });
}

quantity.addEventListener('input', updateButtons);
take.addEventListener('click', () => begin(false));
reserve.addEventListener('click', () => begin(true));
byId('retry-order').addEventListener('click', () => run(async () => {
  const draft = pending();
  if (draft) await submitOrder(draft);
}));
refreshButton.addEventListener('click', () => run(async () => {
  await refresh();
  showNotice(notice, '在庫と申し込み状況を更新しました。');
}, false));

refresh().then(() => {
  showNotice(notice, shelf.available > 0 ? '' : '現在、補充を待っています。予約できます。');
}).catch(error => showNotice(notice, error.message || '在庫を確認できませんでした。', 'error'));
