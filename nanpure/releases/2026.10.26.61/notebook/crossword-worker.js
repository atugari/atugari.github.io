self.window=self;
importScripts('crossword-words.js','crossword-clues.js','crossword-layouts.js','crossword-layout.js','crossword-engine.js');
self.onmessage=event=>{try{const {size,seed,options,history}=event.data;self.postMessage({puzzle:Crossword.generate(size,seed,options,history)})}catch(error){self.postMessage({error:error.message||'問題を作れませんでした。'})}};
