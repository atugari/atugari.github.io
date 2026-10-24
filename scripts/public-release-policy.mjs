// Build versions may include work on features that are not publicly playable.
export function publicReleases(notes){return notes.filter(n=>n.visibility!=='internal'&&n.notify!==false&&n.scope!=='wado'&&!/和同開珎|漢字穴埋め/.test(n.title+' '+n.items.join(' ')));}
export function announcementVersion(notes){return publicReleases(notes)[0]?.version||'';}
