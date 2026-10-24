from pathlib import Path
root=Path(__file__).resolve().parents[2];b=root/'scripts/client-overrides/public'
def edit(rel,a,z,n=1):
 p=b/rel;s=p.read_text();assert s.count(a)==n,(rel,a[:65],s.count(a));p.write_text(s.replace(a,z))
# Prototype records completion on the same redraw which verifies the room partition.
edit('notebook/prototype.js','const r=l,o=D(r),a="path"===r.kind;', 'const r=l,o=D(r),a="path"===r.kind;if(!a)window.NPAchievementHooks?.prototype(r,o,I[r.variant||"classic"]);')
# Correct stroke/undo and marking changes are observable without changing game rules.
edit('notebook/shirupure.html',"if(act==='undo'&&s.undo.length){window.NPAchievements", "if(act==='undo'&&s.undo.length){window.NPAchievements") # scope assertion
# Store crossword manual changes and hint counts alongside its existing save.
edit('notebook/crossword-ui.js','return i.save(l), !0;', 'if(o)window.NPAchievementHooks?.crosswordEdit(o);return i.save(l), !0;')
# Attach full-state helpers needed by title conditions, kept read-only.
edit('notebook/wado-play.js',"function example(){const words=", "function example(){if(state.revealed)w.NPAchievements?.capture('wado-answer',{});const words=")
edit('notebook/wado-play.js',"$('play-example').hidden=!state.revealed;", "$('play-example').hidden=!state.revealed;")
# The viewer's permanent explanation is explicitly openable and never validates an answer.
edit('notebook/wado-play.js',"別の漢字でも、すべての熟語が成り立てば正解です。</p>", "別の漢字でも、すべての熟語が成り立てば正解です。</p><details id=\"play-alternative-notice\"><summary>解答例は一例です</summary><p>未収録の熟語による別解がある場合もあります。紙や頭の中で考えた答えは各自で確かめてください。</p></details>")
# Source has no additional answer input: only explanatory details.
print('Completed game adapters')
