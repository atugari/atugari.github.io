const rows={
 en:['Cloud storage closure notice ({count}/2)','I have read this notice'],
 'zh-Hans':['云端存档服务结束通知（{count}/2）','我已阅读并确认'],
 'zh-Hant':['雲端存檔服務結束通知（{count}/2）','我已閱讀並確認'],
 ko:['클라우드 저장 종료 안내 ({count}/2)','안내를 확인했습니다'],
 es:['Aviso de cierre de la nube ({count}/2)','He leído el aviso'],
 fr:['Avis de fermeture du cloud ({count}/2)','J’ai lu cet avis'],
 de:['Hinweis zur Einstellung des Cloud-Speichers ({count}/2)','Ich habe den Hinweis gelesen'],
 pt:['Aviso de encerramento da nuvem ({count}/2)','Li este aviso'],
 it:['Avviso di chiusura del cloud ({count}/2)','Ho letto questo avviso'],
 nl:['Bericht over het stoppen van de cloud ({count}/2)','Ik heb dit bericht gelezen'],
 sv:['Meddelande om att molnlagringen upphör ({count}/2)','Jag har läst meddelandet'],
 pl:['Powiadomienie o zamknięciu chmury ({count}/2)','Zapoznałem się z powiadomieniem'],
 cs:['Oznámení o ukončení cloudového úložiště ({count}/2)','Oznámení jsem si přečetl(a)'],
 ru:['Уведомление о закрытии облачного хранения ({count}/2)','Я прочитал(а) уведомление'],
 id:['Pemberitahuan penghentian cloud ({count}/2)','Saya sudah membaca pemberitahuan ini'],
 vi:['Thông báo kết thúc lưu trữ đám mây ({count}/2)','Tôi đã đọc thông báo'],
 th:['ประกาศยุติการบันทึกบนคลาวด์ ({count}/2)','อ่านประกาศแล้ว'],
 hi:['क्लाउड सेव बंद होने की सूचना ({count}/2)','मैंने यह सूचना पढ़ ली है'],
 ar:['إشعار بإيقاف التخزين السحابي ({count}/2)','قرأت هذا الإشعار']
};
module.exports=Object.fromEntries(['クラウド保存終了のお知らせ（{count}/2）','確認しました'].map((key,i)=>[key,Object.fromEntries(Object.entries(rows).map(([locale,values])=>[locale,values[i]]))]));
