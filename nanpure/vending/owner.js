import {byId, request, showNotice} from './api.js';
import {drawPairQR} from './qr.js';
import {profileDetail, profilePicker, profilesFrom, profileTitle} from './profiles.js';

const notice = byId('owner-notice');
const keyInput = byId('owner-key');
const codeInput = byId('pair-code');
const list = byId('devices');
const picker = profilePicker(byId('owner-profile-picker'), displayProfile);
const numberFormat = new Intl.NumberFormat('ja-JP');
const mbFormat = new Intl.NumberFormat('ja-JP', {maximumFractionDigits: 1});
const timeFormat = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
});
let ownerKey;
let authAttempt = 0;
let expiresTimer;
let busy = false;

function when(value) {
  return Number.isFinite(value) && value > 0 ? timeFormat.format(value) : '未確認';
}

function displayProfile() {
  const row = picker.selected;
  if (!row) return;
  byId('owner-profile-detail').textContent = profileTitle(row) + ' ・ ' + profileDetail(row) + ' ｜ 在庫 ' +
    numberFormat.format(row.available) + '問' + (Number.isInteger(row.waiting) ? ' ・ 予約待ち ' + numberFormat.format(row.waiting) + '問' : '');
}

function display(result) {
  const rows = profilesFrom(result);
  picker.update(rows);
  byId('owner-profile-stock').hidden = rows.length < 2;
  displayProfile();
  byId('owner-available').textContent = numberFormat.format(rows.reduce((sum, row) => sum + row.available, 0));
  byId('owner-waiting').textContent = numberFormat.format(result.waiting);
  byId('owner-leased').textContent = numberFormat.format(result.leased);
  list.replaceChildren();
  byId('devices-empty').hidden = result.devices.length > 0;
  for (const device of result.devices) {
    const item = document.createElement('li');
    item.dataset.deviceId = device.id;
    const detail = document.createElement('div');
    detail.className = 'record-copy';
    const name = document.createElement('strong');
    name.textContent = device.name;
    const status = document.createElement('span');
    status.textContent = (device.working ? '補充中 ・ ' : '') + '最終接続 ' + when(device.lastSeen);
    detail.append(name, status);
    if (Number.isInteger(device.stockCount) && device.stockCount >= 0) {
      const stock = document.createElement('span');
      stock.textContent = '端末の在庫 ' + numberFormat.format(device.stockCount) + '問' +
        (Number.isInteger(device.stockBytes) && device.stockBytes >= 0 ? ' ・ ' + mbFormat.format(device.stockBytes / 1_000_000) + 'MB' : '') +
        (Number.isFinite(device.stockUpdatedAt) ? ' ・ ' + when(device.stockUpdatedAt) + ' 時点' : '');
      detail.append(stock);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-button';
    remove.dataset.action = 'revoke';
    remove.textContent = '登録を解除する';
    remove.setAttribute('aria-label', device.name + 'の登録を解除する');
    remove.addEventListener('click', () => {
      if (busy || !confirm(device.name + 'の補充担当の登録を解除しますか？')) return;
      void execute(async () => {
        await request({ownerKey, data: {action: 'revoke', id: device.id}});
        await refresh();
        showNotice(notice, '端末の登録を解除しました。', 'success');
      });
    });
    item.append(detail, remove);
    list.append(item);
  }
}

async function refresh() {
  const key = ownerKey;
  const result = await request({ownerKey: key, profiles: true});
  if (key === ownerKey) display(result);
}

function pairingClear() {
  clearTimeout(expiresTimer);
  expiresTimer = undefined;
  codeInput.value = '';
  byId('open-pair').removeAttribute('href');
  byId('pairing').hidden = true;
  const canvas = byId('pair-qr');
  canvas.width = 0;
  canvas.height = 0;
}

function disconnect(quiet = false) {
  authAttempt++;
  ownerKey = undefined;
  keyInput.value = '';
  pairingClear();
  list.replaceChildren();
  byId('owner-content').hidden = true;
  byId('connect-panel').hidden = false;
  showNotice(notice, quiet ? '' : '管理者の接続を解除しました。');
  if (!quiet) keyInput.focus();
}

function updateBusy() {
  for (const button of document.querySelectorAll('button')) button.disabled = busy;
  picker.setBusy(busy);
}

async function execute(action) {
  if (busy) return;
  busy = true;
  updateBusy();
  try {
    await action();
  } catch (error) {
    if (error.status === 401 || error.status === 403) disconnect(true);
    showNotice(notice, error.message || '操作を完了できませんでした。', 'error');
  } finally {
    busy = false;
    updateBusy();
  }
}

byId('owner-form').addEventListener('submit', event => {
  event.preventDefault();
  const key = keyInput.value.trim();
  if (!key || busy) return;
  const attempt = ++authAttempt;
  void execute(async () => {
    showNotice(notice, '管理者の接続を確認しています…');
    const result = await request({ownerKey: key, profiles: true});
    if (attempt !== authAttempt) return;
    display(result);
    ownerKey = key;
    keyInput.value = '';
    byId('connect-panel').hidden = true;
    byId('owner-content').hidden = false;
    showNotice(notice, '管理者として接続しました。', 'success');
    byId('device-name').focus();
  });
});

byId('owner-refresh').addEventListener('click', () => execute(async () => {
  await refresh();
  showNotice(notice, '在庫と端末の情報を更新しました。', 'success');
}));

byId('pair-form').addEventListener('submit', event => {
  event.preventDefault();
  const nameInput = byId('device-name');
  const name = nameInput.value.trim();
  if (!name) {
    showNotice(notice, '端末名を入力してください。', 'error');
    return;
  }
  void execute(async () => {
    pairingClear();
    const key = ownerKey;
    const {code, expires} = await request({ownerKey: key, data: {action: 'pair', name}});
    if (key !== ownerKey) return;
    if (typeof code !== 'string' || !/^[a-f0-9]{64}$/.test(code) || !Number.isFinite(expires)) {
      throw new Error('登録コードを確認できませんでした。');
    }
    const qrPage = new URL('./pair.html', location.href);
    qrPage.hash = 'code=' + code;
    drawPairQR(byId('pair-qr'), qrPage.href);
    byId('open-pair').href = 'nanpure-refill://pair?code=' + code;
    codeInput.value = code;
    byId('pair-expiry').textContent = '1台に使えます。有効期限は ' + when(expires) + '（日本時間）です。';
    byId('pairing').hidden = false;
    nameInput.value = '';
    expiresTimer = setTimeout(() => {
      pairingClear();
      showNotice(notice, '登録コードの有効期限が過ぎました。必要に応じて作り直してください。');
    }, Math.max(0, expires - Date.now()));
    showNotice(notice, 'スマホの登録コードを作りました。', 'success');
  });
});

byId('copy-pair').addEventListener('click', async () => {
  if (!codeInput.value) return;
  try {
    await navigator.clipboard.writeText(codeInput.value);
    showNotice(notice, '登録コードをコピーしました。', 'success');
  } catch {
    codeInput.focus();
    codeInput.select();
    showNotice(notice, '登録コードを選択しました。コピーして補充アプリに入力してください。');
  }
});
byId('owner-disconnect').addEventListener('click', () => disconnect());
window.addEventListener('pagehide', () => disconnect(true));
