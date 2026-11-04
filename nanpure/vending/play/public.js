import {checkNotebookOffers, loadNotebook, savePuzzles} from './notebook.js?v=dedup-1';
import {profileDetail, profileFromKey, profilePicker, profileTitle, validProfileKey} from './profiles.js';

const endpoint = 'https://nanpure-vending-pilot.puzzle-hub-4826.workers.dev/api/vending/public';
const browserKeyName = 'nanpure-public-vending-browser-v1';
const pendingName = 'nanpure-public-vending-pending-v1';
const returnName = 'nanpure-return-v2';
const receiptRetryMs = 7 * 24 * 60 * 60 * 1000 - 60_000;
const maxOfferPages = 64;
const byId = id => document.getElementById(id);
const randomKey = () => Array.from(crypto.getRandomValues(new Uint8Array(32)),
  byte => byte.toString(16).padStart(2, '0')).join('');
const isKey = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const sameProfile = (left, right) => left.profile === right.profile && left.kind === right.kind &&
  left.n === right.n && left.level === right.level && (left.complexity || 0) === (right.complexity || 0) &&
  (left.multiShape || '') === (right.multiShape || '') && (left.linkedShape || '') === (right.linkedShape || '');

const picker = profilePicker(byId('profile-picker'), render);
const notice = byId('notice');
const game = byId('game');
let busy = false;
let pending = readPending();
let lastReceipt;

const expired = attempt => Date.now() - attempt.startedAt >= receiptRetryMs;

function readPending() {
  try {
    const attempt = JSON.parse(sessionStorage.getItem(pendingName));
    if (isKey(attempt?.id) && isKey(attempt.key) && validProfileKey(attempt.profile) &&
        profileFromKey(attempt.profile).profile === attempt.profile && Number.isFinite(attempt.startedAt) &&
        Date.now() - attempt.startedAt < receiptRetryMs &&
        ((attempt.stockDigest === undefined && attempt.notebookDigest === undefined) ||
          (isKey(attempt.stockDigest) && isKey(attempt.notebookDigest)))) return attempt;
  } catch {}
  return null;
}

function startAttempt(profile, offer) {
  let key = localStorage.getItem(browserKeyName);
  if (!isKey(key)) {
    key = randomKey();
    localStorage.setItem(browserKeyName, key);
  }
  const attempt = {id: randomKey(), key, profile, stockDigest: offer.stockDigest,
    notebookDigest: offer.notebookDigest, startedAt: Date.now()};
  sessionStorage.setItem(pendingName, JSON.stringify(attempt));
  return attempt;
}

function clearPending() {
  sessionStorage.removeItem(pendingName);
  pending = null;
}

function showNotice(message, type = '') {
  notice.textContent = message;
  notice.className = type ? 'notice ' + type : 'notice';
}

function render() {
  const selected = picker.selected;
  byId('stock').hidden = !selected;
  byId('take').hidden = !selected || Boolean(pending);
  byId('retry').hidden = !pending;
  byId('reopen').hidden = !lastReceipt;
  picker.setBusy(busy || Boolean(pending));
  for (const id of ['take', 'retry', 'refresh', 'reopen']) byId(id).disabled = busy;
  if (!selected) return;
  byId('shelf-rule').textContent = profileTitle(selected);
  byId('shelf-detail').textContent = profileDetail(selected);
  byId('available').textContent = selected.available.toLocaleString('ja-JP');
}

function setBusy(value) {
  busy = value;
  render();
}

async function request({attempt, action = 'take', profile, after} = {}) {
  const headers = {Accept: 'application/json'};
  const url = new URL(endpoint);
  let body;
  if (attempt) {
    headers['Content-Type'] = 'application/json';
    headers['X-Nanpure-Key'] = attempt.key;
    body = JSON.stringify({action, id: attempt.id, profile: attempt.profile,
      ...(action === 'take' ? {stockDigest: attempt.stockDigest} : {})});
  } else if (profile) {
    url.searchParams.set('profile', profile);
    if (after) url.searchParams.set('after', after);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: attempt ? 'POST' : 'GET', headers, body,
      credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal
    });
    const data = await response.json();
    if (response.ok) return data;
    throw Object.assign(new Error(typeof data.error === 'string' ? data.error : '自販機に接続できませんでした。'),
      {status: response.status});
  } finally {
    clearTimeout(timer);
  }
}

function selectOffer(profile) {
  return checkNotebookOffers(async firstUnseen => {
    const cursors = new Set();
    let after;
    let hasStock = false;
    for (let page = 0; page < maxOfferPages; page++) {
      const {offers, nextCursor} = await request({profile, after});
      if (!Array.isArray(offers) || offers.length > 8 ||
          offers.some(offer => !isKey(offer?.stockDigest) || !isKey(offer.notebookDigest))) {
        throw new Error('在庫の問題を確認できませんでした。');
      }
      hasStock ||= offers.length > 0;
      const offer = await firstUnseen(offers);
      if (offer || nextCursor === null) return {offer, hasStock};
      if (typeof nextCursor !== 'string' || !nextCursor.length || nextCursor.length > 90 ||
          !offers.length || cursors.has(nextCursor)) break;
      cursors.add(nextCursor);
      after = nextCursor;
    }
    throw new Error('在庫を最後まで確認できませんでした。もう一度お試しください。');
  });
}

async function claimForProfile(profile, previous) {
  // A stale offer can be reassigned by another visitor. Try one fresh lookup.
  for (let round = 0; round < 2; round++) {
    if (!pending) {
      showNotice('問題帳にない盤面を確認しています…');
      const {offer, hasStock} = await selectOffer(profile);
      if (!offer) {
        if (!hasStock) await updateStock().catch(() => {});
        showNotice(hasStock ? 'この条件の在庫は、すべて問題帳で見たことのある盤面です。別の条件を選べます。' :
          'この条件の在庫がなくなりました。別の条件を選ぶか、時間をおいて更新してください。');
        return null;
      }
      pending = startAttempt(profile, offer);
      render();
    }
    const attempt = pending;
    // If a board was saved locally while the request was uncertain, only
    // recover an existing receipt. Never allocate it anew on a retry.
    const replayOnly = !attempt.stockDigest || (attempt === previous &&
      !await checkNotebookOffers(firstUnseen => firstUnseen([attempt])));
    showNotice('問題を受け取っています…');
    try {
      return await request({attempt, action: replayOnly ? 'replay' : 'take'});
    } catch (error) {
      if (replayOnly && error.status === 404) {
        clearPending();
        render();
        if (attempt.stockDigest && round === 0) continue;
        showNotice('前の受け取りは見つかりませんでした。遊びたい条件を選び直してください。');
        return null;
      }
      if (error.status !== 409 || replayOnly || round !== 0) throw error;
      clearPending();
      render();
    }
  }
}

async function updateStock() {
  const result = await request();
  if (!Array.isArray(result?.profiles)) throw new Error('在庫の表示を読み込めませんでした。');
  const rows = result.profiles.filter(row => row && validProfileKey(row.profile) &&
    sameProfile(row, profileFromKey(row.profile)) && Number.isSafeInteger(row.available) && row.available > 0);
  picker.update(rows);
  render();
  return rows.length;
}

async function refresh() {
  if (busy) return;
  setBusy(true);
  showNotice('在庫を確認しています…');
  try {
    const count = await updateStock();
    if (pending) showNotice('前の受け取りを再試行できます。');
    else showNotice(count ? '' : 'ただいま在庫がありません。時間をおいて在庫を更新できます。');
  } catch (error) {
    picker.update([]);
    showNotice(error.status === 503 ? 'ただいま自販機はお休み中です。' :
      '在庫を確認できませんでした。通信を確認して、もう一度お試しください。', 'error');
  } finally {
    setBusy(false);
  }
}

function savedUidExists(uid) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('nanpure-chou-data');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      try {
        const lookup = db.transaction('puzzles').objectStore('puzzles').getKey(uid);
        lookup.onsuccess = () => { db.close(); resolve(lookup.result === uid); };
        lookup.onerror = () => { db.close(); reject(lookup.error); };
      } catch (error) {
        db.close();
        reject(error);
      }
    };
  });
}

// Enter through the notebook's return route, then follow its normal open/start
// controls. Starting through the notebook preserves timer, progress and hints.
function waitForBoard(frame, uid) {
  return new Promise((resolve, reject) => {
    let observer;
    let restorePrintSetting;
    let picked = false;
    let started = false;
    let clearedFilter = false;
    const timer = setTimeout(() => {
      observer?.disconnect();
      restorePrintSetting?.();
      reject(new Error('盤面を開けませんでした。受け取った問題は問題帳にあります。'));
    }, 30000);
    frame.addEventListener('load', () => {
      const doc = frame.contentDocument;
      if (!doc?.documentElement) return;
      const matching = action => [...doc.querySelectorAll(`[data-action="${action}"]`)]
        .find(button => button.dataset.id === uid && !button.disabled);
      function advance() {
        if (doc.getElementById('board')?.dataset.panKey === 'sudoku-' + uid) {
          clearTimeout(timer);
          observer.disconnect();
          restorePrintSetting?.();
          resolve();
          return;
        }
        const begin = !started && matching('begin-play');
        if (begin) {
          started = true;
          begin.click();
        } else {
          const pick = !picked && matching('pick-play');
          if (pick) {
            picked = true;
            pick.click();
          } else if (!picked && !clearedFilter) {
            const filter = doc.querySelector('[data-action="finder-quick"][data-find="recent"]');
            if (!filter) return;
            clearedFilter = true;
            // A saved search can hide the only received board. Clear it in this
            // view without overwriting the visitor's saved notebook preferences.
            const meta = frame.contentWindow?.NPStorage?.meta;
            const write = meta?.setItem;
            if (write) {
              const temporary = (key, value) => {
                if (key !== 'nanpure-current-print-v1') write.call(meta, key, value);
              };
              meta.setItem = temporary;
              restorePrintSetting = () => { if (meta.setItem === temporary) meta.setItem = write; };
            }
            filter.click();
          }
        }
      }
      observer = new MutationObserver(advance);
      observer.observe(doc.documentElement, {subtree: true, childList: true});
      advance();
    }, {once: true});
  });
}

async function openGame(receipt) {
  const returnValue = JSON.stringify({formatVersion: 3,
    route: {flow: 'play', step: 1, onlyIds: [receipt.uid]}, stack: []});
  const previousReturn = sessionStorage.getItem(returnName);
  sessionStorage.setItem(returnName, returnValue);
  const frame = document.createElement('iframe');
  frame.title = 'ナンプレ帳のプレイ画面';
  frame.dataset.npTheme = '';
  frame.tabIndex = -1;
  frame.src = receipt.directory + 'index.html#return';
  const ready = waitForBoard(frame, receipt.uid);
  game.hidden = false;
  game.classList.add('loading');
  game.setAttribute('aria-hidden', 'true');
  game.replaceChildren(frame);
  try {
    await ready;
  } catch (error) {
    game.hidden = true;
    frame.remove();
    throw error;
  } finally {
    if (sessionStorage.getItem(returnName) === returnValue) {
      if (previousReturn === null) sessionStorage.removeItem(returnName);
      else sessionStorage.setItem(returnName, previousReturn);
    }
    game.classList.remove('loading');
    game.removeAttribute('aria-hidden');
  }
  byId('main').hidden = true;
  byId('home-link').hidden = true;
  byId('shelf-link').hidden = false;
  frame.removeAttribute('tabindex');
  frame.contentDocument.querySelector('h1')?.focus();
}

async function take() {
  const selected = picker.selected;
  if (busy || (!pending && !selected)) return;
  if (pending && expired(pending)) {
    clearPending();
    render();
    showNotice('前の受け取りの再試行期限が過ぎました。遊びたい条件を選び直してください。');
    return;
  }
  setBusy(true);
  showNotice('受け取る準備をしています…');
  try {
    const directory = await loadNotebook();
    const receipt = await claimForProfile(pending?.profile ?? selected.profile, pending);
    if (!receipt) return;
    const {puzzle} = receipt;
    const profile = profileFromKey(pending.profile);
    await savePuzzles([puzzle], profile, pending.notebookDigest);
    const saved = await savedUidExists(puzzle.uid);
    clearPending();
    if (!saved) {
      showNotice('同じ盤面がすでに問題帳にあります。問題帳で遊べます。');
      await updateStock().catch(() => {});
      return;
    }
    lastReceipt = {uid: puzzle.uid, directory};
    showNotice('盤面を開いています…');
    await openGame(lastReceipt);
    showNotice('問題を問題帳に保存しました。', 'success');
  } catch (error) {
    if (error.status === 409 || error.status === 400) {
      clearPending();
      const remaining = await updateStock().catch(() => { picker.update([]); return 0; });
      showNotice(error.status === 409 ? (remaining ? '在庫が変わりました。遊びたい条件を選び直してください。' :
        '在庫がなくなりました。時間をおいて在庫を更新できます。') : error.message, 'error');
    } else if (error.status === 429 || error.status === 503) {
      showNotice(error.message, 'error');
    } else {
      showNotice(pending ? '受け取りを完了できませんでした。同じ受け取りを再試行できます。' :
        error.message || '問題を開けませんでした。', 'error');
    }
  } finally {
    setBusy(false);
  }
}

byId('refresh').addEventListener('click', refresh);
byId('take').addEventListener('click', take);
byId('retry').addEventListener('click', take);
byId('reopen').addEventListener('click', async () => {
  if (busy || !lastReceipt) return;
  setBusy(true);
  try { await openGame(lastReceipt); }
  catch (error) { showNotice(error.message, 'error'); }
  finally { setBusy(false); }
});
byId('shelf-link').addEventListener('click', async event => {
  event.preventDefault();
  if (busy) return;
  const frame = game.querySelector('iframe');
  setBusy(true);
  try {
    if (frame?.contentDocument) {
      frame.contentWindow.appPause?.();
      await frame.contentWindow.NPStorage?.flush();
    }
  } catch {
    return;
  } finally {
    setBusy(false);
  }
  game.hidden = true;
  frame?.remove();
  byId('main').hidden = false;
  byId('home-link').hidden = false;
  byId('shelf-link').hidden = true;
  byId('title').focus();
  refresh();
});
refresh();
