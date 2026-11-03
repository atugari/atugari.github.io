import fs from 'node:fs';
import path from 'node:path';

// Partial releases copy app.css from overrides as well as from older releases.
// Keep the common puzzle appearance and fixed coordinates in both paths.
export function appendNotebookSharedStyles(root,directory){
  const file=path.join(directory,'app.css');
  let css=fs.readFileSync(file,'utf8');
  for(const name of ['board-appearance.css','language-layout.css']){
    const shared=fs.readFileSync(path.join(root,'scripts/client-overrides/public',name),'utf8');
    if(!css.includes(shared))css+='\n'+shared;
  }
  fs.writeFileSync(file,css);
}
