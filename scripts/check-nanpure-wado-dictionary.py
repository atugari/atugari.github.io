"""Regression checks for lexical restrictions; no source downloads required."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('builder', Path(__file__).parent / 'wado/build-dictionary.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class DictionaryChecks(unittest.TestCase):
    def test_sense_and_reading_must_match_together(self):
        spelling = {'text': '学校', 'tags': []}
        entry = {'kana': [
            {'text': 'がっこう', 'tags': [], 'common': True, 'appliesToKanji': ['*']},
            {'text': 'まなびや', 'tags': [], 'common': False, 'appliesToKanji': ['*']},
            {'text': 'べつご', 'tags': [], 'common': False, 'appliesToKanji': ['別語']},
        ], 'sense': [
            {'appliesToKanji': ['学校'], 'appliesToKana': ['がっこう'], 'misc': ['obs']},
            {'appliesToKanji': ['学校'], 'appliesToKana': ['まなびや'], 'misc': []},
            {'appliesToKanji': ['別語'], 'appliesToKana': ['がっこう'], 'misc': []},
        ]}
        self.assertEqual(builder.jmdict_readings(entry, spelling), [('まなびや', False)])

    def test_established_special_readings_survive(self):
        spelling = {'text': '今朝', 'tags': []}
        entry = {'kana': [{'text': 'けさ', 'tags': ['gikun'], 'common': True, 'appliesToKanji': ['*']}],
                 'sense': [{'appliesToKanji': ['*'], 'appliesToKana': ['*'], 'misc': []}]}
        self.assertEqual(builder.jmdict_readings(entry, spelling), [('けさ', True)])
        for tag in ['rk', 'sk', 'ok', 'ik']:
            entry['kana'][0]['tags'] = [tag]
            self.assertEqual(builder.jmdict_readings(entry, spelling), [])
        entry['kana'][0]['tags'] = []
        spelling['tags'] = ['oK']
        self.assertEqual(builder.jmdict_readings(entry, spelling), [])

    def test_sudachi_filters_and_reading_normalization(self):
        row = ['時計', '5146', '5146', '6000', '時計', '名詞', '普通名詞', '一般', '*', '*', '*', 'トケイ', '時計', '*', 'A', '*', '*', '*', '*']
        self.assertEqual(set(builder.sudachi_rows([row])), {('時計', 'とけい')})
        for column, value in [(1, '-1'), (2, '-1'), (6, '固有名詞'), (5, '接尾辞'), (5, '接頭辞'), (5, '動詞')]:
            changed = row.copy()
            changed[column] = value
            self.assertEqual(list(builder.sudachi_rows([changed])), [])
        with self.assertRaises(ValueError):
            list(builder.sudachi_rows([row[:-1]]))

    def test_juman_does_not_extract_meaning_text_or_costs(self):
        line = '(名詞 (普通名詞 ((読み がっこう)(見出し語 学校 (学舎 1.6))(意味情報 "例:架空 偽語 (別語)"))))'
        self.assertEqual(list(builder.juman_lines([line])), [('学校', 'がっこう'), ('学舎', 'がっこう')])
        self.assertEqual(list(builder.juman_lines([line.replace('普通名詞', '人名')])), [])
        self.assertEqual(list(builder.juman_lines([line.replace('名詞', '接尾辞', 1)])), [])
        with self.assertRaises(ValueError):
            builder.sexpression(line[:-1])


if __name__ == '__main__':
    unittest.main()
