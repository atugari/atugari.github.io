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


def classify(text, lexicons, common, frequency, preferred):
    """Every extracted spelling receives one decision; no vocabulary whitelist."""
    readings = set().union(*(entries.get(text, set()) for entries in lexicons.values()))
    options = [(reading, [name for name, entries in lexicons.items()
                          if reading in entries.get(text, set())]) for reading in readings]
    supported = [option for option in options if len(option[1]) >= 2]
    if text in preferred:
        supported = [option for option in supported if option[0] == preferred[text]]
    if not readings:
        return 'excluded', 'no-ordinary-reading', None
    if not supported:
        families = sum(bool(entries.get(text)) for entries in lexicons.values())
        return 'pending', ('single-family' if families == 1 else 'reading-unconfirmed'), None
    supported.sort(key=lambda item: ((text, item[0]) not in common, -len(item[1]), item[0]))
    reading, support = supported[0]
    zipf = round(9 + math.log10(frequency[text]), 2) if frequency.get(text) else 0
    rank = 1 if zipf >= 3.5 else 2 if zipf >= 2.8 else 3
    return 'adopted', 'reading-supported', {'text': text, 'reading': reading, 'rank': rank,
                                           'readingSources': support, 'zipf': zipf}


def basic_terms(path, expected_sha):
    import openpyxl
    if sha(path.read_bytes()) != expected_sha:
        raise ValueError('Basic-vocabulary reference differs from reviewed snapshot')
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        rows = workbook['4_意味分類体語彙表'].iter_rows(values_only=True)
        if next(rows)[5] != '見出し語':
            raise ValueError('Basic-vocabulary reference columns changed')
        # Exact written forms only. No kana guessing, substring extraction,
        # annotations or phonetic-guide text become two-kanji words.
        candidates = [row for row in rows if isinstance(row[5], str) and HAN.fullmatch(row[5])]
        raw = {row[5] for row in candidates}
        eligible = {row[5] for row in candidates if row[6] in (None, '')}
        return {'raw': sorted(raw), 'terms': sorted(eligible), 'withOkurigana': sorted(raw - eligible)}
    finally:
        workbook.close()


def reference_audit(terms, checks, decisions, source):
    choices = {text: (decision, reason) for text, decision, reason, _ in decisions}
    entries = [{'text': text, 'inDictionary': text in checks,
                'decision': choices[text][0] if text in choices else 'unconfirmed',
                'reason': choices[text][1] if text in choices else 'not-in-current-corpus'} for text in terms]
    return {'source': source, 'scope': 'Exact distinct two-BMP-Han forms in the 1984 survey, not all modern daily words.',
            'total': len(entries), 'dictionaryMatches': sum(e['inDictionary'] for e in entries),
            'generationMatches': sum(e['decision'] == 'adopted' for e in entries),
            'unmatched': [e['text'] for e in entries if not e['inDictionary']],
            'notice': 'Unmatched means unconfirmed in this corpus, never nonexistent or an incorrect answer.',
            'entries': entries}


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
    reference_source = lock['coverageReference']
    reference = basic_terms(args.basic_vocabulary, reference_source['sha256'])
    archive, member = zip_member(args.jmdict, '.json')
    with archive:
        data = json.loads(archive.read(member))
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
    # Bounded re-review of six pronouns; source rows and matching readings are verified.
    import importlib.util
    review_spec = importlib.util.spec_from_file_location('reviewed_vocab', HERE / 'review-vocabulary-20261027.py')
    review_module = importlib.util.module_from_spec(review_spec)
    review_spec.loader.exec_module(review_module)
    review_module.apply_reviewed_pronouns(args.sudachi_small, lexicons, checks)
    frequency = wordfreq.get_frequency_dict('ja')
    preferred = json.loads((HERE / 'preferred-readings.json').read_text())
    preferred.update({r['text']: r['reading'] for r in json.loads((HERE / 'review-20261027.json').read_text())['entries'] if r['decision'] == 'adopted'})
    spellings = sorted(checks)
    words, decisions = [], []
    from collections import Counter
    totals, reasons = Counter(), Counter()
    for text in spellings:
        decision, reason, entry = classify(text, lexicons, common, frequency, preferred)
        totals[decision] += 1
        reasons[reason] += 1
        if entry:
            words.append(entry)
        decisions.append((text, decision, reason, entry))
    legacy = json.loads((HERE / 'legacy-v1.json').read_text())['words']
    assert all(w['text'] in checks for w in legacy), 'Legacy vocabulary lost from checking corpus'
    stats = {'generationWords': len(words), 'alternativeWords': len(checks),
             'classification': dict(totals), 'reasons': dict(reasons),
             'byRank': {str(rank): sum(w['rank'] == rank for w in words) for rank in [1, 2, 3]},
             'bySource': {name: sum(bool(mask & bit) for mask in checks.values())
                          for name, bit in [('jmdict', 1), ('sudachi', 2), ('juman', 4)]}}
    coverage = reference_audit(reference['terms'], checks, decisions, reference_source)
    coverage.update(rawTwoHanForms=len(reference['raw']), outsideScopeWithOkurigana=reference['withOkurigana'])
    coverage['scope'] = 'Distinct two-BMP-Han headwords in the 1984 survey with at least one row having no separate okurigana. Numerals and unusual original forms are retained. Not modern daily-word coverage.'
    result = {
        'version': 2, 'revision': 'whole-lexicon-3',
        'source': 'JMdict + SudachiDict (UniDic family) + JUMAN; wordfreq familiarity',
        'sourceDate': data['dictDate'], 'sources': lock['sources'], 'sourceSha256': actual,
        'copyright': 'See wado-licenses.txt for all retained upstream notices and attribution.',
        'license': 'CC BY-SA 4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
        'noticeUrl': 'wado-licenses.txt',
        'words': words, 'legacyWords': legacy, 'checks': ' '.join(spellings),
        # One source bitmask per spelling, in exactly the same order as checks.
        'checkSources': ''.join(str(checks[text]) for text in spellings),
        'stats': stats,
        'coverage': {k: v for k, v in coverage.items() if k not in {'entries', 'unmatched'}},
    }
    result['reviewedSupplement'] = {'file': 'review-20261027.json', 'sha256': sha((HERE / 'review-20261027.json').read_bytes()), 'scope': 'six individually reviewed pronouns, exact source rows and matching readings'}
    output = ROOT / 'scripts/client-overrides/public/notebook/wado-data.json'
    output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    audit = ROOT / 'scripts/client-overrides/public/notebook/wado-audit.tsv'
    with audit.open('w') as stream:
        stream.write('# Derived lexicon: CC BY-SA 4.0. Attribution and full notices: wado-licenses.txt\n')
        stream.write('text\tdecision\treason\treading\treadingSources\tzipf\trank\tfoundIn\teligibleReadings\n')
        for text, decision, reason, entry in decisions:
            row = [text, decision, reason, entry['reading'] if entry else '',
                   ','.join(entry['readingSources']) if entry else '',
                   str(entry['zipf']) if entry else '', str(entry['rank']) if entry else '',
                   ','.join(name for name, bit in [('jmdict', 1), ('sudachi', 2), ('juman', 4)] if checks[text] & bit),
                   ';'.join(name + ':' + '/'.join(sorted(entries.get(text, set())))
                            for name, entries in lexicons.items() if entries.get(text))]
            stream.write('\t'.join(row) + '\n')
    report = {'revision': result['revision'], 'stats': result['stats'],
              'scope': 'All two-BMP-Han spellings extracted from the three pinned lexical families.',
              'completion': 'Every extracted spelling has exactly one adopted, pending or excluded decision.',
              'reasonDescriptions': {'reading-supported': 'Same spelling and hiragana reading in at least two lexical families.',
                                     'no-ordinary-reading': 'No eligible current independent-word reading after source filters; not a claim of nonexistence.',
                                     'single-family': 'Eligible reading available from one family only; not a claim of invalidity.',
                                     'reading-unconfirmed': 'No reading corroborated by two families, or reviewed preference not corroborated.'},
              'auditSha256': sha(audit.read_bytes())}
    report['reviewedSupplement'] = result['reviewedSupplement']
    report['coverage'] = coverage
    (ROOT / 'scripts/client-overrides/public/notebook/wado-coverage.json').write_text(
        json.dumps(coverage, ensure_ascii=False, separators=(',', ':')) + '\n')
    (HERE / 'dictionary-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result['stats'], ensure_ascii=False))
    print('Processed:', len(decisions), 'Output bytes:', output.stat().st_size)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--jmdict', required=True, type=Path)
    parser.add_argument('--sudachi-small', required=True, type=Path)
    parser.add_argument('--sudachi-core', required=True, type=Path)
    parser.add_argument('--juman', required=True, type=Path)
    parser.add_argument('--basic-vocabulary', required=True, type=Path)
    build(parser.parse_args())
