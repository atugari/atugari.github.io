const keys=['漢字穴埋めの出題語を広げました。','辞書全体から出題語を選び、採用・保留・除外の理由を確認できます。','解答は一例として表示し、成立する別解も使えるようにしました。'];
const rows={
 en:['Expanded the vocabulary for kanji puzzles.','Puzzle words are selected from the full dictionaries, with reasons for inclusion, pending review or exclusion.','Answers are shown as examples; other kanji that form valid compounds are also accepted.'],
 'zh-Hans':['扩充了汉字填空题的出题词汇。','从完整词典中筛选出题词汇，可查看采用、待确认及排除的原因。','答案作为示例展示，其他能组成有效词语的汉字也可作为正确答案。'],
 'zh-Hant':['擴充了漢字填空題的出題詞彙。','從完整詞典中篩選出題詞彙，可查看採用、待確認及排除的原因。','答案作為範例顯示，其他能組成有效詞語的漢字也可作為正確答案。'],
 ko:['한자 문제에 쓰는 어휘를 늘렸습니다.','전체 사전에서 출제 어휘를 고르며, 채택·검토 대기·제외 이유를 확인할 수 있습니다.','정답을 예시로 표시하며, 올바른 단어를 만드는 다른 한자도 정답으로 인정합니다.'],
 es:['Ampliamos el vocabulario de los puzles de kanji.','Las palabras se seleccionan de los diccionarios completos, con motivos de inclusión, revisión pendiente o exclusión.','Las respuestas se muestran como ejemplos; también se aceptan otros kanji que formen palabras válidas.'],
 fr:['Le vocabulaire des jeux de kanji a été élargi.','Les mots sont sélectionnés dans les dictionnaires complets, avec les motifs de sélection, de mise en attente ou d’exclusion.','Les réponses sont des exemples ; les autres kanji formant des mots valides sont aussi acceptés.'],
 de:['Der Wortschatz für Kanji-Rätsel wurde erweitert.','Rätselwörter werden aus den vollständigen Wörterbüchern ausgewählt. Gründe für Aufnahme, ausstehende Prüfung oder Ausschluss sind einsehbar.','Lösungen werden als Beispiele angezeigt; andere Kanji, die gültige Wörter bilden, werden ebenfalls anerkannt.'],
 pt:['Alargámos o vocabulário dos puzzles de kanji.','As palavras são selecionadas dos dicionários completos, com motivos de inclusão, análise pendente ou exclusão.','As respostas são exemplos; outros kanji que formem palavras válidas também são aceites.'],
 it:['Il vocabolario dei puzzle di kanji è stato ampliato.','Le parole vengono selezionate dai dizionari completi, con motivi di inclusione, verifica in sospeso o esclusione.','Le risposte sono esempi; sono accettati anche altri kanji che formano parole valide.'],
 nl:['De woordenschat voor kanji-puzzels is uitgebreid.','Woorden worden uit de volledige woordenboeken gekozen, met redenen voor opname, nader onderzoek of uitsluiting.','Antwoorden zijn voorbeelden; andere kanji die geldige woorden vormen, worden ook goed gerekend.'],
 sv:['Ordförrådet för kanjipussel har utökats.','Orden väljs ur hela ordböckerna, med skäl för urval, väntande granskning eller uteslutning.','Svaren visas som exempel; andra kanji som bildar giltiga ord godtas också.'],
 pl:['Rozszerzono słownictwo łamigłówek kanji.','Słowa są wybierane z pełnych słowników; można sprawdzić powody przyjęcia, oczekiwania na weryfikację lub wykluczenia.','Odpowiedzi są przykładami; inne znaki kanji tworzące poprawne słowa również są uznawane.'],
 cs:['Slovní zásoba rébusů kandži byla rozšířena.','Slova se vybírají z celých slovníků a lze zobrazit důvody přijetí, odložení k ověření nebo vyřazení.','Odpovědi jsou příklady; uznávají se i jiné znaky kandži, které tvoří platná slova.'],
 ru:['Словарь головоломок кандзи расширен.','Слова выбираются из полных словарей; можно посмотреть причины включения, ожидания проверки или исключения.','Ответы показаны как примеры; другие кандзи, образующие допустимые слова, также принимаются.'],
 id:['Kosakata teka-teki kanji diperluas.','Kata dipilih dari seluruh kamus, dengan alasan penerimaan, peninjauan tertunda, atau pengecualian.','Jawaban ditampilkan sebagai contoh; kanji lain yang membentuk kata yang sah juga diterima.'],
 vi:['Đã mở rộng vốn từ cho câu đố kanji.','Từ được chọn từ toàn bộ các từ điển, kèm lý do chấp nhận, chờ xác minh hoặc loại bỏ.','Đáp án được hiển thị dưới dạng ví dụ; kanji khác tạo thành các từ hợp lệ cũng được chấp nhận.'],
 th:['เพิ่มคำศัพท์สำหรับปริศนาคันจิแล้ว','เลือกคำจากพจนานุกรมทั้งหมด พร้อมแสดงเหตุผลที่ใช้ รอตรวจสอบ หรือไม่นำมาใช้','แสดงคำตอบเป็นตัวอย่าง และยอมรับคันจิอื่นที่ประกอบเป็นคำที่ถูกต้องด้วย'],
 hi:['कांजी पहेलियों की शब्दावली बढ़ाई गई है।','पूरे शब्दकोशों से शब्द चुने जाते हैं। शामिल करने, जाँच लंबित रखने या हटाने का कारण देखा जा सकता है।','उत्तर उदाहरण के रूप में दिखाए जाते हैं; मान्य शब्द बनाने वाले दूसरे कांजी भी स्वीकार किए जाते हैं।'],
 ar:['تم توسيع مفردات ألغاز كانجي.','تُختار الكلمات من القواميس كاملة، مع توضيح أسباب الإدراج أو انتظار المراجعة أو الاستبعاد.','تُعرض الإجابات كأمثلة، وتُقبل أيضاً أحرف كانجي أخرى تكوّن كلمات صحيحة.']
};
module.exports=Object.fromEntries(keys.map((key,i)=>[key,Object.fromEntries(Object.entries(rows).map(([locale,values])=>[locale,values[i]]))]));
