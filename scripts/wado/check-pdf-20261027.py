"""Check actual exported PDF pages, text identities, and physical A4 bounds."""
import json,re,sys
from pathlib import Path
import pdfplumber
from pypdf import PdfReader
out=Path(sys.argv[1] if len(sys.argv)>1 else 'wado-verification-output')
manifest=json.loads((out/'browser-and-pdf-manifest.json').read_text());results=[]
for entry in manifest['pdfs']:
 path=out/entry['file'];reader=PdfReader(path);assert len(reader.pages)==entry['expectedPages'],(entry['file'],len(reader.pages),entry['expectedPages'])
 with pdfplumber.open(path) as pdf:
  all_ids=[]
  for i,page in enumerate(pdf.pages):
   assert abs(page.width-210/25.4*72)<1 and abs(page.height-297/25.4*72)<1,(entry['file'],i,'A4 box')
   text=re.sub(r'\s+','',page.extract_text() or '');assert '\ufffd' not in text and '\x00' not in text
   found=re.findall(r'WADO-Q\d{2}',text);expected=['WADO-Q'+str(n).zfill(2) for n in entry['pages'][i]['numbers']]
   assert sorted(found)==sorted(expected),(entry['file'],i,found,expected);all_ids.extend(found)
   assert all(c['x0']>=-0.5 and c['x1']<=page.width+.5 and c['top']>=-.5 and c['bottom']<=page.height+.5 for c in page.chars),(entry['file'],i,'character outside physical page')
   if entry['kind']=='questions':assert '解答例：' not in text
  for fid in entry['ids']:assert all_ids.count(fid)==entry['expectedOccurrences'],(fid,entry['file'])
 results.append({'file':entry['file'],'pages':len(reader.pages),'pageSize':'A4 210 x 297 mm','questionIdentityOccurrences':'pass','physicalPageTextBounds':'pass','previewPageCountMatchesPDF':True})
report={'checks':results,'limitations':manifest['unverified'],'notice':'Text bounds and DOM geometry do not replace visual inspection or actual device/paper checks.'};(out/'pdf-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2))
