"""Rebuild offline translation drafts from the checked English catalog.

Models are external Argos packages, never shipped to visitors. Run with
CTranslate2, SentencePiece, Argos tokenizer and sacremoses installed:
python build-additional-translations.py SOURCES.json MODEL_DIR CACHE_DIR OUTPUT_DIR [codes...]
Human terminology corrections live in additional-overrides.json.
"""
import collections,concurrent.futures,json,re,sys,time,unicodedata
from pathlib import Path
import ctranslate2
from argostranslate.tokenizer import SentencePieceTokenizer,BPETokenizer
PARAM=re.compile(r'\{\w+\}')
KEEP=re.compile(r'Nanpure Cho|Nanpure Notebook|Shirupure|OFUSE|Japanese Wordnet|Francis Bond|Takayuki Kuribayashi|NICT|MintoDog|Kenney|CC0(?: 1\.0)?|MP3|WAV|(?:Cozy|Magic) Puzzle In-Game [1-4]|Pizzicato jingles/[\w.]+|https?://[^\s<>]+|[\w-]+\.(?:json|zip|pdf|mp3|csv|txt|ogg|wav)|[A-Z]–[A-Z]|[●○▲△■□◆◇◎◉★☆♠♡♣♢♤♧①-⑳×÷=+→≥≤|]+|[\u3040-\u30ff\u3400-\u9fff]+')
NUMBER=re.compile(r'\d+(?:[.,]\d+)*')
def normal(text):
    text=''.join(str(unicodedata.digit(x)) if x.isdecimal() else x for x in text)
    return re.sub(r'\{\s*([\w]+)\s*\}',r'{\1}',text).strip()
def params(text):return collections.Counter(PARAM.findall(text))
def numbers(text):return collections.Counter(re.sub(r'[.,]','',x) for x in NUMBER.findall(PARAM.sub(' ',text)))
def run(code,sources,models,cache_dir,out_dir):
    import os
    os.environ['OMP_NUM_THREADS']='2'
    start=time.monotonic();folder=next((Path(models)/code).iterdir())
    tokenizer=SentencePieceTokenizer(folder/'sentencepiece.model') if (folder/'sentencepiece.model').exists() else BPETokenizer(folder/'bpe.model','en',code)
    translator=ctranslate2.Translator(str(folder/'model'),device='cpu',compute_type='int8',inter_threads=1,intra_threads=2)
    cache_file=Path(cache_dir)/(code+'.json');cache=json.loads(cache_file.read_text()) if cache_file.exists() else {}
    def decode(strings):
        if not strings:return []
        result=translator.translate_batch([tokenizer.encode(s) for s in strings],beam_size=2,max_batch_size=32,max_input_length=0,max_decoding_length=512,replace_unknowns=True)
        return [normal(tokenizer.decode(r.hypotheses[0])) for r in result]
    tasks=[];prepared={}
    for row in sources:
        raw=row['en']
        if raw in cache:continue
        if raw in prepared:continue
        keep=[]
        def mask(m):
            token='{keep'+str(len(keep))+'}';keep.append(m.group());return token
        masked=KEEP.sub(mask,raw)
        # Older English models treat an en dash as an unknown word. Spell out
        # numeric intervals before translation while retaining their endpoints.
        masked=re.sub(r'(?<=[\d}])–(?=[\d{])',' to ',masked)
        masked=masked.translate(str.maketrans({'“':'"','”':'"','’':"'",'—':'-'}))
        prepared[raw]=(masked,keep)
        if not re.search('[A-Za-z]',KEEP.sub('',raw)):
            cache[raw]=raw;continue
        # Avoid exceeding the translation model's sentence window. Splitting
        # only on sentence boundaries preserves whole clauses and their slots.
        pieces=re.split(r'(?<=[.!?])\s+|\n+',masked)
        for piece in pieces:
            if piece.strip():tasks.append((raw,piece))
    Path(cache_dir).mkdir(parents=True,exist_ok=True)
    intermediate=Path(cache_dir)/(code+'-sentences.json')
    saved=json.loads(intermediate.read_text()) if intermediate.exists() else {}
    output=collections.defaultdict(list)
    tasks=[item for item in tasks if item[0] not in saved]
    for at in range(0,len(tasks),128):
        batch=tasks[at:at+128];translations=decode([p for _,p in batch])
        for (raw,piece),text in zip(batch,translations):output[raw].append(text)
        if at%512==0:print(json.dumps({'locale':code,'sentences':min(at+128,len(tasks)),'total':len(tasks)}),flush=True)
    saved.update(output);intermediate.write_text(json.dumps(saved,ensure_ascii=False))
    repaired=[];fallback=[];errors=[]
    for raw,(masked,keep) in prepared.items():
        if raw in cache:continue
        text=' '.join(saved[raw])
        if params(text)!=params(masked) or numbers(text)!=numbers(masked) or not text:
            # Real numeric sentinels are copied more reliably than letter
            # placeholders by small models. Restore every slot exactly.
            spans=[]
            def token(m):
                tag=str(871001+len(spans));spans.append((tag,m.group()));return tag
            numbered=re.sub(r'\{\w+\}|\d+(?:[.,]\d+)*',token,masked)
            text=decode([numbered])[0]
            for tag,original in spans:
                pattern=r'[\s,.\u066c]*'.join(tag)
                text=re.sub(pattern,lambda m:original,text)
            text=normal(text);repaired.append(raw)
        if params(text)!=params(masked) or numbers(text)!=numbers(masked) or not text:
            # Preserve formatting tokens by translating the surrounding prose.
            # The complete prose remains translated; no English fallback is
            # silently substituted for a missing target-language sentence.
            chunks=re.split(r'(\{\w+\}|\d+(?:[.,]\d+)*)',masked)
            prose=[s for i,s in enumerate(chunks) if i%2==0 and s.strip()]
            translated=iter(decode(prose));parts=[]
            for i,s in enumerate(chunks):
                parts.append(s if i%2 or not s.strip() else next(translated))
            text=' '.join(parts);text=normal(text);fallback.append(raw)
        if params(text)!=params(masked) or numbers(text)!=numbers(masked):errors.append({'source':raw,'translation':text})
        for i,value in enumerate(keep):text=text.replace('{keep'+str(i)+'}',value)
        assert text,(code,raw)
        cache[raw]=text
    Path(cache_dir).mkdir(parents=True,exist_ok=True);cache_file.write_text(json.dumps(cache,ensure_ascii=False))
    pack={row['key']:cache[row['en']] for row in sources}
    Path(out_dir).mkdir(parents=True,exist_ok=True);(Path(out_dir)/(code+'.json')).write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
    (Path(cache_dir)/(code+'-report.json')).write_text(json.dumps({'locale':code,'numericRepair':repaired,'fragmentRepair':fallback,'errors':errors,'seconds':round(time.monotonic()-start,1)},ensure_ascii=False,indent=2))
    print(json.dumps({'complete':code,'entries':len(pack),'numericRepair':len(repaired),'fragmentRepair':len(fallback),'seconds':round(time.monotonic()-start,1)}),flush=True)
if __name__=='__main__':
    sources,models,cache,out,*codes=sys.argv[1:]
    rows=json.loads(Path(sources).read_text())
    with concurrent.futures.ProcessPoolExecutor(max_workers=3) as pool:
        for result in concurrent.futures.as_completed([pool.submit(run,code,rows,models,cache,out) for code in codes]):result.result()
