import unittest
from font_text import readable

class FontTextTests(unittest.TestCase):
    def test_chemical_subscripts_remain_legible_when_font_has_no_subscript(self):
        self.assertEqual(readable('CO₂ / H₂O',set(map(ord,'CO2 /HO'))),'CO2 / H2O')
    def test_supported_characters_keep_the_original_typesetting(self):
        value='CO₂ ２㎖';self.assertEqual(readable(value,set(map(ord,value))),value)
    def test_unrelated_missing_kanji_is_not_replaced_or_hidden(self):
        self.assertEqual(readable('髙',set(map(ord,'高'))),'髙')

if __name__=='__main__':unittest.main()
