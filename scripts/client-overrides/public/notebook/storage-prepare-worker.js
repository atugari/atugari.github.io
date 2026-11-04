/* Prepare the unchanged IndexedDB record format away from the page's UI thread. */
importScripts('pako.min.js', 'compact.js', 'lan-identity.js', 'transfer.js');
self.onmessage = async event => {
  try {
    if (typeof event.data !== 'string') throw Error('保存する問題を確認できません。');
    const row = JSON.parse(event.data);
    const digest = await self.NPTransfer.digestAsync(row);
    const data = self.NPCompact.zip(event.data);
    self.postMessage({record: {uid: row.uid, compactVersion: 1, data}, digest}, [data.buffer]);
  } catch (error) {
    self.postMessage({error: String(error.message || error)});
  }
};
