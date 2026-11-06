"""Render varied search-intent copy for the four daily X slots."""
from datetime import date
from pathlib import Path
from daily_plan import daily_plan

SLOT_COPY = {
    '08:00': ('無料ナンプレ（数独）で朝の脳トレ！', '#ナンプレ #数独 #脳トレ'),
    '12:00': ('毎日更新の無料パズル問題で、休憩時間に頭の体操！', '#無料パズル #頭の体操 #パズル'),
    '18:00': ('ナンプレ（数独）の問題集を探している人も、今日の4問に挑戦！', '#ナンプレ問題集 #数独 #無料ゲーム'),
    '21:00': ('数字パズル・言葉パズルで夜の頭の体操！', '#パズル #毎日更新 #脳トレ'),
}

def render_text(day, include_url=False, slot='08:00'):
    if slot not in SLOT_COPY:
        raise ValueError('Invalid publication slot')
    parsed = date.fromisoformat(day)
    label = f'{parsed.month}/{parsed.day}'
    text = (Path(__file__).parent / 'approved-post.txt').read_text(encoding='utf-8').rstrip('\n')
    names = '・'.join(item['title'] for item in daily_plan(day))
    hook, hashtags = SLOT_COPY[slot]
    text = text.replace('{date_label}', label).replace('{slot_message}', hook)
    text = text.replace('{puzzle_names}', names).replace('{hashtags}', hashtags)
    text = text.replace('{url_line}', 'https://atugari.github.io/nanpure/' if include_url else '')
    return text

def weighted_length(text):
    urls = [token for token in text.split() if token.startswith(('http://', 'https://'))]
    without_urls = text
    for url in urls:
        without_urls = without_urls.replace(url, '')
    count = sum(1 if ord(c) <= 0x10ff or 0x2000 <= ord(c) <= 0x200d or 0x2010 <= ord(c) <= 0x201f or 0x2032 <= ord(c) <= 0x2037 else 2 for c in without_urls)
    return count + 23 * len(urls)
