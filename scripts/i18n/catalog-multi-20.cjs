module.exports = {
 '盤面の枚数・大きさ・ルールによっては、作成に時間がかかる場合があります。途中で止められます。': {
  en: 'The number, sizes and rules of the boards can make generation take longer. You can stop at any time.',
  'zh-Hans': '盘面的数量、大小和规则可能会延长生成时间。您可以随时停止。',
  'zh-Hant': '盤面的數量、大小和規則可能會延長生成時間。您可以隨時停止。',
  ko: '보드의 수, 크기, 규칙에 따라 생성 시간이 길어질 수 있습니다. 언제든지 중지할 수 있습니다.',
  es: 'La cantidad, el tamaño y las reglas de los tableros pueden alargar la generación. Puedes detenerla en cualquier momento.',
  fr: 'Le nombre, la taille et les règles des grilles peuvent allonger la génération. Vous pouvez l’arrêter à tout moment.',
  de: 'Je nach Anzahl, Größe und Regeln der Raster kann die Erstellung länger dauern. Du kannst sie jederzeit stoppen.',
  pt: 'O número, o tamanho e as regras das grelhas podem demorar a geração. Pode pará-la a qualquer momento.',
  it: 'Il numero, le dimensioni e le regole delle griglie possono allungare la generazione. Puoi fermarla in qualsiasi momento.',
  nl: 'Door het aantal, de afmetingen en de regels van de rasters kan het maken langer duren. Je kunt op elk moment stoppen.',
  sv: 'Antalet bräden, deras storlek och regler kan göra att det tar längre tid. Du kan avbryta när som helst.',
  pl: 'Liczba, rozmiar i reguły plansz mogą wydłużyć generowanie. Możesz je zatrzymać w każdej chwili.',
  cs: 'Počet, velikost a pravidla mřížek mohou prodloužit vytváření. Můžete ho kdykoli zastavit.',
  ru: 'Число, размер и правила полей могут увеличить время генерации. Её можно остановить в любой момент.',
  id: 'Jumlah, ukuran, dan aturan papan dapat memperlama pembuatan. Anda bisa menghentikannya kapan saja.',
  vi: 'Số lượng, kích thước và quy tắc của các bảng có thể khiến quá trình tạo lâu hơn. Bạn có thể dừng bất cứ lúc nào.',
  th: 'จำนวน ขนาด และกติกาของกระดานอาจทำให้ใช้เวลาสร้างนานขึ้น คุณหยุดได้ทุกเมื่อ',
  hi: 'बोर्डों की संख्या, आकार और नियमों के कारण पहेली बनाने में ज़्यादा समय लग सकता है। आप इसे किसी भी समय रोक सकते हैं।',
  ar: 'قد يستغرق الإنشاء وقتًا أطول حسب عدد اللوحات وأحجامها وقواعدها. يمكنك إيقافه في أي وقت.'
 }
};

const ruleCopy = {
 en: ['Anti-king Sudoku', 'Disjoint groups Sudoku', 'Diagonally adjacent cells cannot contain the same digit.', 'The nine cells in the same position in their 3×3 boxes must also contain each digit from 1 to 9 once.'],
 'zh-Hans': ['反国王数独', '同位数独', '对角相邻的格子不能填入相同数字。', '各个3×3宫中位置相同的九个格子也必须各使用一次1至9。'],
 'zh-Hant': ['反國王數獨', '同位數獨', '對角相鄰的格子不能填入相同數字。', '各個3×3宮中位置相同的九個格子也必須各使用一次1至9。'],
 ko: ['안티 킹 스도쿠', '같은 위치 스도쿠', '대각선으로 인접한 칸에는 같은 숫자를 넣을 수 없습니다.', '각 3×3 블록에서 같은 위치에 있는 아홉 칸에도 1부터 9까지 한 번씩 넣습니다.'],
 es: ['Sudoku antirrey', 'Sudoku de grupos disjuntos', 'Las celdas adyacentes en diagonal no pueden tener el mismo número.', 'Las nueve celdas con la misma posición en sus bloques 3×3 también deben contener cada número del 1 al 9 una vez.'],
 fr: ['Sudoku anti-roi', 'Sudoku à groupes disjoints', 'Deux cases adjacentes en diagonale ne peuvent pas contenir le même chiffre.', 'Les neuf cases à la même position dans leur bloc 3×3 doivent aussi contenir chaque chiffre de 1 à 9 une fois.'],
 de: ['Anti-König-Sudoku', 'Sudoku mit disjunkten Gruppen', 'Diagonal benachbarte Felder dürfen nicht dieselbe Ziffer enthalten.', 'Die neun Felder an derselben Stelle ihrer 3×3-Blöcke enthalten ebenfalls jede Ziffer von 1 bis 9 genau einmal.'],
 pt: ['Sudoku antirrei', 'Sudoku de grupos disjuntos', 'Células vizinhas na diagonal não podem conter o mesmo algarismo.', 'As nove células na mesma posição dos blocos 3×3 também contêm cada algarismo de 1 a 9 uma vez.'],
 it: ['Sudoku anti-re', 'Sudoku a gruppi disgiunti', 'Le celle adiacenti in diagonale non possono contenere la stessa cifra.', 'Anche le nove celle nella stessa posizione dei riquadri 3×3 contengono ogni cifra da 1 a 9 una volta.'],
 nl: ['Anti-koning-sudoku', 'Sudoku met disjuncte groepen', 'Diagonaal aangrenzende vakjes mogen niet hetzelfde cijfer bevatten.', 'Ook de negen vakjes op dezelfde plek in hun 3×3-blok bevatten elk cijfer van 1 tot en met 9 één keer.'],
 sv: ['Antikungssudoku', 'Sudoku med disjunkta grupper', 'Diagonalt angränsande rutor får inte innehålla samma siffra.', 'Även de nio rutorna på samma plats i sina 3×3-block innehåller varje siffra från 1 till 9 en gång.'],
 pl: ['Sudoku antykról', 'Sudoku z grupami rozłącznymi', 'Pola sąsiadujące po przekątnej nie mogą zawierać tej samej cyfry.', 'Dziewięć pól na tej samej pozycji w blokach 3×3 również zawiera każdą cyfrę od 1 do 9 dokładnie raz.'],
 cs: ['Sudoku proti králi', 'Sudoku s disjunktními skupinami', 'Úhlopříčně sousedící políčka nesmějí obsahovat stejnou číslici.', 'Devět políček na stejné pozici v blocích 3×3 také obsahuje každou číslici od 1 do 9 právě jednou.'],
 ru: ['Судоку «Антикороль»', 'Судоку с непересекающимися группами', 'В соседних по диагонали клетках не может быть одинаковых цифр.', 'В девяти клетках на одинаковой позиции в блоках 3×3 каждая цифра от 1 до 9 тоже встречается один раз.'],
 id: ['Sudoku anti-raja', 'Sudoku kelompok terpisah', 'Sel yang bersebelahan secara diagonal tidak boleh berisi angka yang sama.', 'Sembilan sel dengan posisi yang sama di blok 3×3 masing-masing juga memuat setiap angka dari 1 hingga 9 satu kali.'],
 vi: ['Sudoku chống vua', 'Sudoku nhóm rời nhau', 'Các ô kề nhau theo đường chéo không được chứa cùng một chữ số.', 'Chín ô ở cùng vị trí trong các khối 3×3 cũng phải chứa mỗi chữ số từ 1 đến 9 đúng một lần.'],
 th: ['ซูโดกุกันคิง', 'ซูโดกุกลุ่มตำแหน่งเดียวกัน', 'ช่องที่อยู่ติดกันในแนวทแยงต้องไม่มีตัวเลขซ้ำกัน', 'เก้าช่องที่อยู่ในตำแหน่งเดียวกันของกรอบ 3×3 ก็ต้องมีตัวเลข 1 ถึง 9 อย่างละหนึ่งครั้ง'],
 hi: ['एंटी-किंग सुडोकू', 'अलग समूहों वाला सुडोकू', 'तिरछे सटे खानों में एक ही अंक नहीं हो सकता।', 'हर 3×3 बॉक्स में एक ही स्थान पर मौजूद नौ खानों में भी 1 से 9 तक हर अंक एक बार होना चाहिए।'],
 ar: ['سودوكو ضد الملك', 'سودوكو المجموعات المنفصلة', 'لا يجوز أن تحتوي خليتان متجاورتان قطريًا على الرقم نفسه.', 'يجب أيضًا أن تحتوي الخلايا التسع الواقعة في الموضع نفسه داخل مربعات 3×3 على كل رقم من 1 إلى 9 مرة واحدة.']
};
const keys = [
 'アンチキングナンプレ', '同位置ナンプレ',
 '斜めに隣り合うマスには、同じ数字を入れません。',
 '各3×3枠の同じ位置にある9マスでも、1〜9を1回ずつ使います。'
];
for (const [index,key] of keys.entries()) {
 module.exports[key]=Object.fromEntries(Object.entries(ruleCopy).map(([locale,copy])=>[locale,copy[index]]));
}
