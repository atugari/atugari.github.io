"""Build the attributed offline lexicon. See README.md for inputs and licences."""
import argparse
import csv
import hashlib
import io
import json
import math
import re
import zipfile
from collections import defaultdict
from importlib.metadata import version
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
HAN = re.compile(r'[\u3400-\u9fff]{2}\Z')
KANA = re.compile(r'[ぁ-ゖー]+\Z')
BAD_SENSE = {'arch', 'obs', 'vulg', 'derog', 'sl'}
BAD_SPELLING = {'rK', 'sK', 'oK', 'iK'}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def zip_member(path, suffix):
    archive = zipfile.ZipFile(path)
    matches = [n for n in archive.namelist() if n.endswith(suffix)]
    if len(matches) != 1:
        raise ValueError(f'Expected one {suffix} file: {path}')
    return archive, matches[0]


def zip_hash(path, suffix):
    archive, member = zip_member(path, suffix)
    digest = hashlib.sha256()
    with archive, archive.open(member) as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def applies(values, text):
    return '*' in values or text in values


def jmdict_readings(entry, spelling):
    """Bind each sense to BOTH its spelling and its individual reading."""
    if BAD_SPELLING.intersection(spelling['tags']):
        return []
    result = []
    for reading in entry['kana']:
        # gikun includes familiar established readings such as 今朝→けさ and
        # 下手→へた; do not discard them merely for being nonliteral readings.
        if set(reading['tags']) - {'gikun'} or not KANA.fullmatch(reading['text']):
            continue
        if not applies(reading['appliesToKanji'], spelling['text']):
            continue
        senses = [s for s in entry['sense']
                  if applies(s['appliesToKanji'], spelling['text'])
                  and applies(s['appliesToKana'], reading['text'])
                  and not BAD_SENSE.intersection(s['misc'])]
        if senses:
            result.append((reading['text'], bool(reading['common'])))
    return result


def hiragana(text):
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in text)


def sudachi_rows(rows):
    """Parse V0/V1 lexical columns. Exclude constituent-only rows and names."""
    for row in rows:
        if not row:
            continue
        if row[0] == 'IndexForm':
            if row[:7] != ['IndexForm', 'LeftId', 'RightId', 'Cost', 'Headword', 'POS1', 'POS2']:
                raise ValueError('Unsupported Sudachi CSV header')
            continue
        if len(row) != 19:
            raise ValueError('Unsupported Sudachi CSV columns')
        if int(row[1]) < 0 or int(row[2]) < 0:
            continue
        ordinary = (row[5] == '名詞' and row[6] == '普通名詞'
                    or row[5] in {'形状詞', '副詞', '感動詞'}
                    or row[5] in {'動詞', '形容詞'} and row[10].startswith('終止形'))
        if not ordinary:
            continue
        reading = hiragana(row[11])
        for text in {row[0], row[4]}:
            if HAN.fullmatch(text) and KANA.fullmatch(reading):
                yield text, reading


def sudachi(path):
    archive, member = zip_member(path, '.csv')
    with archive, archive.open(member) as stream:
        yield from sudachi_rows(csv.reader(io.TextIOWrapper(stream, encoding='utf-8')))


def sexpression(line):
    """Parse quoted strings and cost tuples without interpreting meaning text."""
    tokens = re.findall(r'"(?:[^"\\]|\\.)*"|[()]|[^\s()]+', line)
    stack = []
    result = None
    for token in tokens:
        if token == '(':
            node = []
            if stack:
                stack[-1].append(node)
            elif result is not None:
                raise ValueError('Multiple JUMAN expressions')
            else:
                result = node
            stack.append(node)
        elif token == ')':
            if not stack:
                raise ValueError('Unbalanced JUMAN expression')
            stack.pop()
        else:
            if not stack:
                raise ValueError('Invalid JUMAN expression')
            stack[-1].append(token)
    if stack:
        raise ValueError('Unbalanced JUMAN expression')
    return result


def fields(node):
    if not isinstance(node, list):
        return
    if node and node[0] in ('読み', '見出し語'):
        yield node
    for child in node:
        if isinstance(child, list):
            yield from fields(child)


def juman_lines(lines):
    for line in lines:
        line = line.strip()
        if not line or line.startswith(';'):
            continue
        expression = sexpression(line)
        if expression[0] not in {'名詞', '副詞', '形容詞', '感動詞'}:
            continue
        if expression[0] == '名詞' and expression[1][0] not in {'普通名詞', 'サ変名詞', '時相名詞'}:
            continue
        values = dict((node[0], node[1:]) for node in fields(expression))
        reading = values['読み'][0]
        if not KANA.fullmatch(reading):
            continue
        for spelling in values['見出し語']:
            text = spelling[0] if isinstance(spelling, list) else spelling
            if HAN.fullmatch(text):
                yield text, reading


def build(args):
    import wordfreq
    lock = json.loads((HERE / 'sources.lock.json').read_text())
    actual = {
        'jmdict': zip_hash(args.jmdict, '.json'),
        'sudachiSmall': zip_hash(args.sudachi_small, '.csv'),
        'sudachiCore': zip_hash(args.sudachi_core, '.csv'),
        'juman': sha((args.juman / 'dic/ContentW.dic').read_bytes()),
        'wordfreq': sha(Path(wordfreq.available_languages('best')['ja']).read_bytes()),
    }
    if version('wordfreq') != '3.1.1' or actual != lock['sha256']:
        raise ValueError('Source snapshot differs from sources.lock.json; review the update before rebuilding')
    archive, member = zip_member(args.jmdict, '.json')
    with archive:
        data = json.loads(archive.read(member))
    ranks = {}
    rank = 1
    for line in (HERE / 'vocabulary.txt').read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        if line.isdigit():
            rank = int(line)
        else:
            for text in line.split():
                if HAN.fullmatch(text):
                    ranks[text] = min(ranks.get(text, rank), rank)
    lexicons = {name: defaultdict(set) for name in ('jmdict', 'sudachi', 'juman')}
    checks = defaultdict(int)
    common = set()
    for entry in data['words']:
        for spelling in entry['kanji']:
            text = spelling['text']
            if not HAN.fullmatch(text):
                continue
            # Retain even rare/historical JMdict spellings for conservative
            # alternative detection. Generation has a separate, stricter pool.
            checks[text] |= 1
            for reading, is_common in jmdict_readings(entry, spelling):
                lexicons['jmdict'][text].add(reading)
                if is_common:
                    common.add((text, reading))
    for path in (args.sudachi_small, args.sudachi_core):
        for text, reading in sudachi(path):
            lexicons['sudachi'][text].add(reading)
            checks[text] |= 2
    for text, reading in juman_lines((args.juman / 'dic/ContentW.dic').read_text().splitlines()):
        lexicons['juman'][text].add(reading)
        checks[text] |= 4
    frequency = wordfreq.get_frequency_dict('ja')
    preferred = json.loads((HERE / 'preferred-readings.json').read_text())
    words, omitted, demoted = [], [], []
    for text, rank in sorted(ranks.items()):
        options = []
        for reading in lexicons['jmdict'][text]:
            support = [name for name, entries in lexicons.items() if reading in entries[text]]
            if len(support) >= 2:
                options.append((reading, support))
        if text in preferred:
            options = [item for item in options if item[0] == preferred[text]]
        if not options:
            omitted.append(text)
            continue
        options.sort(key=lambda item: ((text, item[0]) not in common, -len(item[1]), item[0]))
        reading, support = options[0]
        zipf = round(9 + math.log10(frequency[text]), 2) if frequency.get(text) else 0
        # Frequency can only make manually rated words harder, never promote them.
        effective = max(rank, 1 if zipf >= 3.5 else 2 if zipf >= 2.8 else 3)
        if effective != rank:
            demoted.append({'text': text, 'from': rank, 'to': effective, 'zipf': zipf})
        words.append({'text': text, 'reading': reading, 'rank': effective,
                      'readingSources': support, 'zipf': zipf})
    spellings = sorted(checks)
    result = {
        'version': 1, 'revision': 'multi-lexicon-1',
        'source': 'JMdict + SudachiDict (UniDic family) + JUMAN; wordfreq familiarity',
        'sourceDate': data['dictDate'], 'sources': lock['sources'], 'sourceSha256': actual,
        'copyright': 'See wado-licenses.txt for all retained upstream notices and attribution.',
        'license': 'CC BY-SA 4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
        'noticeUrl': 'wado-licenses.txt',
        'words': words, 'checks': ' '.join(spellings),
        # One source bitmask per spelling, in exactly the same order as checks.
        'checkSources': ''.join(str(checks[text]) for text in spellings),
        'stats': {'generationWords': len(words), 'alternativeWords': len(checks),
                  'bySource': {name: sum(bool(mask & bit) for mask in checks.values())
                               for name, bit in [('jmdict', 1), ('sudachi', 2), ('juman', 4)]}},
    }
    output = ROOT / 'scripts/client-overrides/public/notebook/wado-data.json'
    output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    report = {'revision': result['revision'], 'stats': result['stats'],
              'omittedVocabulary': omitted, 'demotedVocabulary': demoted}
    (HERE / 'dictionary-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result['stats'], ensure_ascii=False))
    print('Omitted:', len(omitted), 'Demoted:', len(demoted), 'Output bytes:', output.stat().st_size)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--jmdict', required=True, type=Path)
    parser.add_argument('--sudachi-small', required=True, type=Path)
    parser.add_argument('--sudachi-core', required=True, type=Path)
    parser.add_argument('--juman', required=True, type=Path)
    build(parser.parse_args())
