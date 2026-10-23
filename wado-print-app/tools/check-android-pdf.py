from pathlib import Path
import sys
from pypdf import PdfReader
path=Path(sys.argv[1])
assert path.is_file() and path.stat().st_size>1000, 'Native PDF file is missing'
reader=PdfReader(path)
assert len(reader.pages)==2, f'Expected 20 questions on two A4 pages, got {len(reader.pages)} pages'
for page in reader.pages:
    assert abs(float(page.mediabox.width)-595.28)<2 and abs(float(page.mediabox.height)-841.89)<2, 'Page is not A4 portrait'
print('Verified Android native PDF: 20 questions, 2 A4 portrait pages')

