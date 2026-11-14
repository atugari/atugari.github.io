import unittest
from pathlib import Path
import importlib.util

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("promo_copy", ROOT / "copy.py")
promo_copy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(promo_copy)


class PromoCopyTests(unittest.TestCase):
    def test_all_twenty_locales_have_four_games_and_three_intro_variants(self):
        catalog = promo_copy.load_catalog()
        promo_copy.validate_catalog(catalog)
        self.assertEqual(len(catalog["posts_per_language"]), 20)

    def test_all_240_locale_variant_focus_combinations_fit_x_limit(self):
        catalog = promo_copy.load_catalog()
        for locale in catalog["posts_per_language"]:
            for variant in range(3):
                for focus in range(4):
                    text = promo_copy.build_post(locale, variant=variant, focus=focus, catalog=catalog)
                    self.assertIn(catalog["url"], text)
                    self.assertLessEqual(promo_copy.weighted_length(text), 280)

    def test_rejects_wrong_locale(self):
        with self.assertRaises(ValueError):
            promo_copy.build_post("xx", variant=0, focus=0)

    def test_rejects_out_of_range_template(self):
        with self.assertRaises(ValueError):
            promo_copy.build_post("ja", variant=3, focus=0)


if __name__ == "__main__":
    unittest.main()
