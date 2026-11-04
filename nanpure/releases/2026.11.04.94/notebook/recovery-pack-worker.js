/* Use the existing backup codec off the UI thread; the saved format stays compatible. */
self.window=self;
importScripts('pako.min.js','compact.js');
self.onmessage=event=>{try{self.postMessage({payload:self.NPCompact.stringify(event.data)})}catch(error){self.postMessage({error:String(error.message||error)})}};
