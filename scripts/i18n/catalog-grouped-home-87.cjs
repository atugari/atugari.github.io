// New navigation copy uses English as the shared fallback until native copy is available.
const locales=Object.keys(require('./languages.json')).filter(x=>x!=='ja');
const copy={
 'やりたいことから、ひとつ。':'Choose what you would like to do.',
 '保存した日替わりの途中経過を再開':'Resume your saved daily puzzle',
 '遊ぶ・作る・学ぶ':'Play, create and learn',
 '問題集から選んで、すぐスタート。':'Choose a puzzle and start playing.',
 '条件を選ぶ・模様を描く。':'Choose rules or draw a pattern.',
 '解法で学ぶ':'Learn solving techniques',
 '手順を追って、ひらめきを自分の力に。':'Follow each step and build your skills.',
 '保存した問題・印刷・作成履歴':'Saved puzzles, printing and creation history',
 '記録と達成':'Records and achievements',
 'みんなの記録を見る':'See everyone’s results',
 '過去の日替わり・達成メダル':'Past daily puzzles and medals',
 '作品を楽しむ':'Explore creations',
 '企画展':'Exhibitions',
 '自分の展示室（制作中）':'My gallery (Beta)',
 '解答リプレイ':'Solution replays',
 'ほかのパズルはパレあそびへ':'More puzzles at Pare Asobi',
 'シルプレ・和同開珎・クロスワードなど':'Shirupure, Wado, crosswords and more',
 '表示方法を保存できませんでした。この画面では切り替えられます。':'The layout could not be saved. It still applies to this page.',
 '画面の表示方法':'Screen layout',
 'PC表示':'Desktop',
 '横向きにすると、PC表示で広く使えます。':'Turn your phone sideways for a wider desktop layout.'
};
module.exports=Object.fromEntries(Object.entries(copy).map(([k,v])=>[k,Object.fromEntries(locales.map(l=>[l,v]))]));
const native={
 '遊ぶ・作る・学ぶ':['游戏・创作・学习','遊玩・創作・學習','플레이・만들기・배우기','Jugar, crear y aprender','Jouer, créer et apprendre','Spielen, erstellen und lernen','Jogar, criar e aprender','Gioca, crea e impara','Spelen, maken en leren','Spela, skapa och lär','Graj, twórz i ucz się','Hrajte, tvořte a učte se','Играть, создавать и учиться','Main, buat, dan belajar','Chơi, tạo và học','เล่น สร้าง และเรียนรู้','खेलें, बनाएँ और सीखें','العب وأنشئ وتعلّم'],
 '記録と達成':['记录与成就','紀錄與成就','기록과 업적','Registros y logros','Records et réussites','Rekorde und Erfolge','Recordes e conquistas','Record e traguardi','Records en prestaties','Rekord och prestationer','Wyniki i osiągnięcia','Výsledky a úspěchy','Рекорды и достижения','Rekor dan pencapaian','Kỷ lục và thành tích','สถิติและความสำเร็จ','रिकॉर्ड और उपलब्धियाँ','السجلات والإنجازات'],
 '作品を楽しむ':['欣赏作品','欣賞作品','작품 둘러보기','Explorar creaciones','Explorer les créations','Kreationen entdecken','Explorar criações','Esplora le creazioni','Creaties ontdekken','Utforska skapelser','Odkrywaj prace','Prohlížet výtvory','Смотреть работы','Jelajahi karya','Khám phá tác phẩm','สำรวจผลงาน','रचनाएँ देखें','استكشف الإبداعات'],
 '画面の表示方法':['屏幕布局','畫面配置','화면 배치','Diseño de pantalla','Disposition de l’écran','Bildschirmlayout','Layout da tela','Layout dello schermo','Schermindeling','Skärmlayout','Układ ekranu','Rozložení obrazovky','Макет экрана','Tata letak layar','Bố cục màn hình','รูปแบบหน้าจอ','स्क्रीन लेआउट','تخطيط الشاشة'],
 'PC表示':['电脑显示','電腦顯示','PC 화면','Escritorio','Bureau','Desktop','Desktop','Desktop','Desktop','Datorvy','Widok komputera','Počítač','Для ПК','Desktop','Máy tính','เดสก์ท็อป','डेस्कटॉप','سطح المكتب']
};
const order=['zh-Hans','zh-Hant','ko','es','fr','de','pt','it','nl','sv','pl','cs','ru','id','vi','th','hi','ar'];for(const[k,values]of Object.entries(native))order.forEach((l,i)=>module.exports[k][l]=values[i]);
