export const contactTopics = { question: ['howto', 'save', 'ranking', 'language', 'other'], bug: ['display', 'input', 'generation', 'save', 'ranking', 'ruby', 'other'], suggestion: ['usability', 'rules', 'accessibility', 'other'], payment: ['payment'], other: ['other'] };
export const contactLabels = { question: '使い方の質問', bug: '不具合の報告', suggestion: '改善の希望', payment: '海外からの支払い報告', other: 'その他', howto: '遊び方', save: '保存・読み込み', ranking: 'ランキング', language: '言語', display: '表示がおかしい', input: '操作できない', generation: '問題を生成できない', ruby: 'ふりがなが違う', usability: '画面・操作', rules: 'ルール・問題', accessibility: '読みやすさ', japan: '日本', asia: 'アジア（日本以外）', europe: 'ヨーロッパ', americas: '北米・中南米', oceania: 'オセアニア', africa: 'アフリカ', unknown: '回答しない', success: '利用できた', failed: '利用できなかった', notTried: 'まだ試していない', visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', jcb: 'JCB', diners: 'Diners Club', discover: 'Discover', apple: 'Apple Pay', google: 'Google Pay' };
export function validateContact(v) {
    if (!v || typeof v !== 'object' || typeof v.category !== 'string' || !Object.hasOwn(contactTopics, v.category) || !contactTopics[v.category].includes(v.topic))
        return null;
    const detail = typeof v.detail === 'string' ? v.detail.trim() : '';
    if (!detail || [...detail].length > 1000)
        return null;
    const regions = ['japan', 'asia', 'europe', 'americas', 'oceania', 'africa', 'other', 'unknown'], methods = ['visa', 'mastercard', 'amex', 'jcb', 'diners', 'discover', 'apple', 'google', 'other', 'unknown'], results = ['success', 'failed', 'notTried'];
    if (v.category === 'payment' && (!regions.includes(v.region) || !methods.includes(v.method) || !results.includes(v.result)))
        return null;
    return { category: v.category, topic: v.topic, detail, region: v.category === 'payment' ? v.region : null, method: v.category === 'payment' ? v.method : null, result: v.category === 'payment' ? v.result : null, locale: ['ja', 'en', 'zh-Hans', 'zh-Hant', 'ko', 'es', 'fr', 'de', 'pt'].includes(v.locale) ? v.locale : 'ja' };
}
