'use client';
import {useLocale} from './locale-context';

export default function Support(){
 const{t}=useLocale();
 return <section className="creator-support membership-support">
  <h2>{t('制作を応援')}</h2>
  <section className="membership-card">
   <h3>{t('ナンプレ帳 応援メンバー')}</h3>
   <p className="membership-price">{t('月100円で制作を応援')}</p>
   <p>{t('メンバー限定の機能や追加特典はありません。')}</p>
   <p>{t('問題づくり・プレイ・印刷は無料で使えます。')}</p>
   <a className="membership-link" href="https://ofuse.me/memberships/5107" target="_blank" rel="noopener noreferrer">{t('応援メンバーの詳細へ')} ↗</a>
  </section>
  <section className="membership-once">
   <h3>{t('メッセージ・1回ごとの支援')}</h3>
   <a className="membership-link secondary-action" href="https://ofuse.me/o?uid=228296" target="_blank" rel="noopener noreferrer">{t('OFUSEでメッセージを送る')} ↗</a>
  </section>
  <p className="membership-external">{t('OFUSEのページへ移動します')}</p>
 </section>;
}
