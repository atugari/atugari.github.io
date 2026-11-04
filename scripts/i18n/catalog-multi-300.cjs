// The order below keeps the same editor labels together in every language.
const sources = [
  '盤面を選ぶ',
  '前の盤面',
  '次の盤面',
  '重ね方の見本',
  '選ぶと配置を変更',
  '角をつないだ階段',
  'ジグザグにつなぐ',
  '縦横に重ねる',
  '広い範囲を重ねる',
  'ルールは盤面ごとに選べます。組み合わせた問題全体の難易度は、次の画面で選びます。',
  '選択中の盤面を編集しています。',
  '{total}面中 {start}〜{end}面を表示'
];
const translations = {
  en: [
    'Choose a board', 'Previous board', 'Next board', 'Overlap examples',
    'Selecting an example changes the layout', 'Staircase with joined corners',
    'Connect in a zigzag', 'Overlap in rows and columns', 'Overlap larger areas',
    'You can choose a rule for each board. Choose the difficulty of the whole connected puzzle on the next screen.',
    'You are editing the selected board.', 'Showing boards {start}–{end} of {total}'
  ],
  'zh-Hans': [
    '选择盘面', '上一个盘面', '下一个盘面', '重叠方式示例',
    '选择示例后会更改布局', '角部相连的阶梯',
    '锯齿形连接', '横纵重叠', '大范围重叠',
    '可以为每个盘面选择规则。在下一个画面选择整个组合题目的难度。',
    '正在编辑选中的盘面。', '显示第{start}至{end}个盘面，共{total}个'
  ],
  'zh-Hant': [
    '選擇盤面', '上一個盤面', '下一個盤面', '重疊方式範例',
    '選擇範例後會變更配置', '角部相連的階梯',
    '鋸齒形連接', '橫縱重疊', '大範圍重疊',
    '可以為每個盤面選擇規則。在下一個畫面選擇整個組合題目的難度。',
    '正在編輯選取的盤面。', '顯示第{start}至{end}個盤面，共{total}個'
  ],
  ko: [
    '판 선택', '이전 판', '다음 판', '겹치는 배치 예시',
    '선택하면 배치가 변경됩니다', '모서리를 연결한 계단',
    '지그재그로 연결', '가로세로로 겹치기', '넓은 영역 겹치기',
    '판마다 규칙을 선택할 수 있습니다. 다음 화면에서 연결된 퍼즐 전체의 난이도를 선택합니다.',
    '선택한 판을 편집하고 있습니다.', '전체 {total}개 중 {start}~{end}번 판 표시'
  ],
  es: [
    'Elegir tablero', 'Tablero anterior', 'Tablero siguiente', 'Ejemplos de superposición',
    'Al elegir un ejemplo cambia la disposición', 'Escalera con esquinas unidas',
    'Conectar en zigzag', 'Superponer en filas y columnas', 'Superponer áreas más grandes',
    'Puedes elegir una regla para cada tablero. En la siguiente pantalla, elige la dificultad del rompecabezas conectado completo.',
    'Estás editando el tablero seleccionado.', 'Mostrando tableros {start}–{end} de {total}'
  ],
  fr: [
    'Choisir une grille', 'Grille précédente', 'Grille suivante', 'Exemples de superposition',
    'Choisir un exemple modifie la disposition', 'Escalier aux coins reliés',
    'Relier en zigzag', 'Superposer en lignes et colonnes', 'Superposer de plus grandes zones',
    'Vous pouvez choisir une règle pour chaque grille. Choisissez la difficulté de l’ensemble des grilles reliées à l’écran suivant.',
    'Vous modifiez la grille sélectionnée.', 'Grilles {start} à {end} sur {total}'
  ],
  de: [
    'Raster auswählen', 'Vorheriges Raster', 'Nächstes Raster', 'Beispiele für Überlappungen',
    'Die Auswahl eines Beispiels ändert die Anordnung', 'Treppe mit verbundenen Ecken',
    'Im Zickzack verbinden', 'In Reihen und Spalten überlappen', 'Größere Bereiche überlappen',
    'Du kannst für jedes Raster eine Regel auswählen. Auf der nächsten Seite wählst du die Schwierigkeit des gesamten verbundenen Rätsels.',
    'Du bearbeitest das ausgewählte Raster.', 'Raster {start}–{end} von {total}'
  ],
  pt: [
    'Escolher grelha', 'Grelha anterior', 'Grelha seguinte', 'Exemplos de sobreposição',
    'Escolher um exemplo altera a disposição', 'Escada com cantos unidos',
    'Ligar em ziguezague', 'Sobrepor em linhas e colunas', 'Sobrepor áreas maiores',
    'Pode escolher uma regra para cada grelha. No ecrã seguinte, escolha a dificuldade do conjunto de grelhas ligadas.',
    'Está a editar a grelha selecionada.', 'A mostrar grelhas {start}–{end} de {total}'
  ],
  it: [
    'Scegli una griglia', 'Griglia precedente', 'Griglia successiva', 'Esempi di sovrapposizione',
    'Scegliendo un esempio si modifica la disposizione', 'Scala con angoli collegati',
    'Collega a zigzag', 'Sovrapponi in righe e colonne', 'Sovrapponi aree più grandi',
    'Puoi scegliere una regola per ogni griglia. Nella schermata successiva scegli la difficoltà dell’intero rompicapo collegato.',
    'Stai modificando la griglia selezionata.', 'Griglie {start}–{end} di {total}'
  ],
  nl: [
    'Raster kiezen', 'Vorig raster', 'Volgend raster', 'Voorbeelden van overlap',
    'Een voorbeeld kiezen wijzigt de indeling', 'Trap met verbonden hoeken',
    'In een zigzag verbinden', 'In rijen en kolommen overlappen', 'Grotere gebieden overlappen',
    'Je kunt voor elk raster een regel kiezen. Op het volgende scherm kies je de moeilijkheid van de hele verbonden puzzel.',
    'Je bewerkt het geselecteerde raster.', 'Rasters {start}–{end} van {total}'
  ],
  sv: [
    'Välj bräde', 'Föregående bräde', 'Nästa bräde', 'Exempel på överlappning',
    'Valet av exempel ändrar placeringen', 'Trappa med sammanfogade hörn',
    'Koppla ihop i sicksack', 'Överlappa i rader och kolumner', 'Överlappa större områden',
    'Du kan välja en regel för varje bräde. På nästa skärm väljer du svårighetsgraden för hela det sammanhängande pusslet.',
    'Du redigerar det valda brädet.', 'Visar bräden {start}–{end} av {total}'
  ],
  pl: [
    'Wybierz planszę', 'Poprzednia plansza', 'Następna plansza', 'Przykłady nakładania',
    'Wybranie przykładu zmienia układ', 'Schody z połączonymi narożnikami',
    'Połącz w zygzak', 'Nałóż w wierszach i kolumnach', 'Nałóż większe obszary',
    'Możesz wybrać regułę dla każdej planszy. Na następnym ekranie wybierz trudność całej połączonej łamigłówki.',
    'Edytujesz wybraną planszę.', 'Plansze {start}–{end} z {total}'
  ],
  cs: [
    'Vybrat mřížku', 'Předchozí mřížka', 'Další mřížka', 'Příklady překrytí',
    'Výběr příkladu změní rozložení', 'Schody se spojenými rohy',
    'Spojit klikatě', 'Překrýt v řadách a sloupcích', 'Překrýt větší oblasti',
    'Pro každou mřížku můžete vybrat pravidlo. Na další obrazovce vyberte obtížnost celého propojeného hlavolamu.',
    'Upravujete vybranou mřížku.', 'Zobrazeny mřížky {start}–{end} z {total}'
  ],
  ru: [
    'Выбрать поле', 'Предыдущее поле', 'Следующее поле', 'Примеры наложения',
    'Выбор примера изменит расположение', 'Лестница с соединёнными углами',
    'Соединить зигзагом', 'Наложить по рядам и столбцам', 'Наложить большие области',
    'Для каждого поля можно выбрать правило. На следующем экране выберите сложность всей соединённой головоломки.',
    'Вы редактируете выбранное поле.', 'Поля {start}–{end} из {total}'
  ],
  id: [
    'Pilih papan', 'Papan sebelumnya', 'Papan berikutnya', 'Contoh tumpang tindih',
    'Memilih contoh mengubah tata letak', 'Tangga dengan sudut terhubung',
    'Hubungkan secara zig-zag', 'Tumpang tindih dalam baris dan kolom', 'Tumpang tindih area yang lebih luas',
    'Anda dapat memilih aturan untuk setiap papan. Pilih tingkat kesulitan seluruh teka-teki yang terhubung pada layar berikutnya.',
    'Anda sedang mengedit papan yang dipilih.', 'Menampilkan papan {start}–{end} dari {total}'
  ],
  vi: [
    'Chọn bảng', 'Bảng trước', 'Bảng tiếp theo', 'Ví dụ về cách chồng bảng',
    'Chọn ví dụ sẽ thay đổi bố cục', 'Bậc thang nối các góc',
    'Nối theo đường zíc zắc', 'Chồng theo hàng và cột', 'Chồng các vùng lớn hơn',
    'Bạn có thể chọn quy tắc cho từng bảng. Ở màn hình tiếp theo, chọn độ khó cho toàn bộ câu đố đã ghép.',
    'Bạn đang chỉnh sửa bảng đã chọn.', 'Hiển thị bảng {start}–{end} trong {total} bảng'
  ],
  th: [
    'เลือกกระดาน', 'กระดานก่อนหน้า', 'กระดานถัดไป', 'ตัวอย่างการซ้อนกระดาน',
    'เลือกตัวอย่างเพื่อเปลี่ยนการจัดวาง', 'ขั้นบันไดที่เชื่อมกันตรงมุม',
    'เชื่อมแบบซิกแซก', 'ซ้อนในแนวแถวและคอลัมน์', 'ซ้อนพื้นที่ให้มากขึ้น',
    'คุณเลือกกติกาให้แต่ละกระดานได้ เลือกระดับความยากของปริศนาที่เชื่อมกันทั้งหมดในหน้าถัดไป',
    'คุณกำลังแก้ไขกระดานที่เลือก', 'แสดงกระดาน {start}–{end} จาก {total} กระดาน'
  ],
  hi: [
    'बोर्ड चुनें', 'पिछला बोर्ड', 'अगला बोर्ड', 'ओवरलैप के उदाहरण',
    'उदाहरण चुनने पर विन्यास बदल जाएगा', 'कोनों से जुड़ी सीढ़ी',
    'ज़िगज़ैग में जोड़ें', 'पंक्तियों और स्तंभों में ओवरलैप करें', 'बड़े हिस्से ओवरलैप करें',
    'आप हर बोर्ड के लिए नियम चुन सकते हैं। अगली स्क्रीन पर पूरी जुड़ी हुई पहेली की कठिनाई चुनें।',
    'आप चुने हुए बोर्ड को संपादित कर रहे हैं।', '{total} में से {start}–{end} बोर्ड दिखाए जा रहे हैं'
  ],
  ar: [
    'اختيار لوحة', 'اللوحة السابقة', 'اللوحة التالية', 'أمثلة على التداخل',
    'اختيار مثال يغيّر الترتيب', 'درج بزوايا متصلة',
    'توصيل بشكل متعرج', 'تداخل في صفوف وأعمدة', 'تداخل مساحات أكبر',
    'يمكنك اختيار قاعدة لكل لوحة. اختر مستوى صعوبة اللغز المترابط بالكامل في الشاشة التالية.',
    'أنت تعدّل اللوحة المحددة.', 'عرض اللوحات {start}–{end} من أصل {total}'
  ]
};
module.exports = Object.fromEntries(sources.map((source, index) => [
  source, Object.fromEntries(Object.entries(translations).map(([locale, labels]) => [locale, labels[index]]))
]));

const imageSources = ['前の画像', '次の画像', '画像を切り替えて保存できます。全ての画像で問題全体になります。'];
const imageTranslations = {
  en: ['Previous image', 'Next image', 'Switch between images to save them. All images together contain the whole puzzle.'],
  'zh-Hans': ['上一张图片', '下一张图片', '可以切换图片并保存。所有图片合起来才是完整题目。'],
  'zh-Hant': ['上一張圖片', '下一張圖片', '可以切換圖片並儲存。所有圖片合起來才是完整題目。'],
  ko: ['이전 이미지', '다음 이미지', '이미지를 전환하며 저장할 수 있습니다. 모든 이미지를 합쳐야 퍼즐 전체가 됩니다.'],
  es: ['Imagen anterior', 'Imagen siguiente', 'Cambia de imagen para guardarlas. Todas las imágenes juntas contienen el rompecabezas completo.'],
  fr: ['Image précédente', 'Image suivante', 'Passez d’une image à l’autre pour les enregistrer. Toutes les images réunies contiennent le puzzle entier.'],
  de: ['Vorheriges Bild', 'Nächstes Bild', 'Wechsle zwischen den Bildern, um sie zu speichern. Alle Bilder zusammen enthalten das vollständige Rätsel.'],
  pt: ['Imagem anterior', 'Imagem seguinte', 'Mude de imagem para as guardar. Todas as imagens juntas contêm o puzzle completo.'],
  it: ['Immagine precedente', 'Immagine successiva', 'Passa da un’immagine all’altra per salvarle. Tutte le immagini insieme contengono il rompicapo completo.'],
  nl: ['Vorige afbeelding', 'Volgende afbeelding', 'Wissel tussen de afbeeldingen om ze op te slaan. Alle afbeeldingen samen bevatten de hele puzzel.'],
  sv: ['Föregående bild', 'Nästa bild', 'Växla mellan bilderna för att spara dem. Alla bilder tillsammans innehåller hela pusslet.'],
  pl: ['Poprzedni obraz', 'Następny obraz', 'Przełączaj obrazy, aby je zapisać. Wszystkie obrazy razem zawierają całą łamigłówkę.'],
  cs: ['Předchozí obrázek', 'Další obrázek', 'Přepínejte mezi obrázky a ukládejte je. Všechny obrázky dohromady obsahují celý hlavolam.'],
  ru: ['Предыдущее изображение', 'Следующее изображение', 'Переключайтесь между изображениями, чтобы сохранить их. Все изображения вместе содержат головоломку целиком.'],
  id: ['Gambar sebelumnya', 'Gambar berikutnya', 'Beralih antar gambar untuk menyimpannya. Semua gambar bersama-sama memuat seluruh teka-teki.'],
  vi: ['Ảnh trước', 'Ảnh tiếp theo', 'Bạn có thể chuyển giữa các ảnh để lưu. Tất cả ảnh ghép lại mới tạo thành toàn bộ câu đố.'],
  th: ['ภาพก่อนหน้า', 'ภาพถัดไป', 'สลับภาพเพื่อบันทึกได้ ภาพทั้งหมดรวมกันจึงจะเป็นปริศนาที่ครบถ้วน'],
  hi: ['पिछली छवि', 'अगली छवि', 'छवियाँ बदलकर उन्हें सहेज सकते हैं। सभी छवियाँ मिलकर पूरी पहेली बनाती हैं।'],
  ar: ['الصورة السابقة', 'الصورة التالية', 'يمكنك التنقل بين الصور لحفظها. تحتوي جميع الصور معًا على اللغز بالكامل.']
};
for (const [index, source] of imageSources.entries()) {
  module.exports[source] = Object.fromEntries(Object.entries(imageTranslations).map(([locale, labels]) => [locale, labels[index]]));
}
module.exports['画像'] = {
  en: 'Image', 'zh-Hans': '图片', 'zh-Hant': '圖片', ko: '이미지',
  es: 'Imagen', fr: 'Image', de: 'Bild', pt: 'Imagem', it: 'Immagine',
  nl: 'Afbeelding', sv: 'Bild', pl: 'Obraz', cs: 'Obrázek', ru: 'Изображение',
  id: 'Gambar', vi: 'Ảnh', th: 'ภาพ', hi: 'छवि', ar: 'الصورة'
};

const printSources = [
  '大きなマルチナンプレは、紙を分割する方法で印刷してください。',
  'この紙に入るマスが多すぎます。分割する枚数を増やしてください。'
];
const printTranslations = {
  en: ['Print large Multi Sudoku puzzles across multiple sheets.', 'There are too many cells on this sheet. Split the puzzle across more sheets.'],
  'zh-Hans': ['请使用分纸打印方式，将大型多盘数独打印在多张纸上。', '这张纸上的格子太多。请增加分纸张数。'],
  'zh-Hant': ['請使用分紙列印方式，將大型多盤數獨列印在多張紙上。', '這張紙上的格子太多。請增加分紙張數。'],
  ko: ['큰 멀티 스도쿠는 여러 장의 종이에 나누어 인쇄해 주세요.', '이 종이에 들어가는 칸이 너무 많습니다. 나눌 종이 수를 늘려 주세요.'],
  es: ['Imprime los sudokus múltiples grandes repartidos en varias hojas.', 'Hay demasiadas celdas en esta hoja. Divide el rompecabezas entre más hojas.'],
  fr: ['Imprimez les grands sudokus multiples sur plusieurs feuilles.', 'Cette feuille contient trop de cases. Répartissez le puzzle sur davantage de feuilles.'],
  de: ['Drucke große Multi-Sudokus auf mehrere Blätter verteilt.', 'Auf diesem Blatt sind zu viele Felder. Verteile das Rätsel auf mehr Blätter.'],
  pt: ['Imprima os sudokus múltiplos grandes divididos por várias folhas.', 'Esta folha tem demasiadas células. Divida o puzzle por mais folhas.'],
  it: ['Stampa i sudoku multipli grandi su più fogli.', 'Ci sono troppe celle su questo foglio. Dividi il rompicapo su più fogli.'],
  nl: ['Druk grote multi-sudoku’s verdeeld over meerdere vellen af.', 'Er staan te veel vakjes op dit vel. Verdeel de puzzel over meer vellen.'],
  sv: ['Skriv ut stora multisudokun på flera ark.', 'Det är för många rutor på det här arket. Fördela pusslet över fler ark.'],
  pl: ['Drukuj duże sudoku wieloplanszowe na kilku arkuszach.', 'Na tym arkuszu jest za dużo pól. Podziel łamigłówkę na więcej arkuszy.'],
  cs: ['Velká vícemřížková sudoku tiskněte na více listů.', 'Na tomto listu je příliš mnoho políček. Rozdělte hlavolam na více listů.'],
  ru: ['Печатайте большие судоку с несколькими полями на нескольких листах.', 'На этом листе слишком много клеток. Разделите головоломку на большее число листов.'],
  id: ['Cetak Multi Sudoku besar dengan membaginya ke beberapa lembar kertas.', 'Terlalu banyak sel pada lembar ini. Bagi teka-teki ke lebih banyak lembar.'],
  vi: ['Hãy in Sudoku nhiều bảng cỡ lớn trên nhiều tờ giấy.', 'Tờ giấy này chứa quá nhiều ô. Hãy chia câu đố ra nhiều tờ hơn.'],
  th: ['พิมพ์มัลติซูโดกุขนาดใหญ่โดยแบ่งลงบนกระดาษหลายแผ่น', 'กระดาษแผ่นนี้มีช่องมากเกินไป กรุณาแบ่งปริศนาลงบนกระดาษจำนวนมากขึ้น'],
  hi: ['बड़ी मल्टी सुडोकू पहेलियों को कई पन्नों में बाँटकर प्रिंट करें।', 'इस पन्ने पर बहुत ज़्यादा खाने हैं। पहेली को और अधिक पन्नों में बाँटें।'],
  ar: ['اطبع ألغاز السودوكو الكبيرة متعددة اللوحات موزعة على عدة أوراق.', 'توجد خلايا كثيرة جدًا على هذه الورقة. وزّع اللغز على عدد أكبر من الأوراق.']
};
for (const [index, source] of printSources.entries()) {
  module.exports[source] = Object.fromEntries(Object.entries(printTranslations).map(([locale, labels]) => [locale, labels[index]]));
}
