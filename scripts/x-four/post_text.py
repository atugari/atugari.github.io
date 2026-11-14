"""Render varied search-intent copy for the Pareasobi X account."""
from datetime import date
from pathlib import Path
from daily_plan import daily_plan

SLOT_COPY = {
    '08:00': ('パレあそびの無料パズルで朝の脳トレ！', '#パレあそび #ナンプレ #脳トレ'),
    '12:00': ('休憩時間に、今日の4問で頭の体操！', '#パレあそび #無料パズル #頭の体操'),
    '18:00': ('ナンプレもクロスワードも、パレあそびで挑戦！', '#パレあそび #クロスワード #数独'),
    '21:00': ('今日の締めくくりに、言葉と数字のパズル！', '#パレあそび #毎日更新 #脳トレ'),
}

def render_text(day, slot='08:00'):
    if slot not in SLOT_COPY:
        raise ValueError('Invalid publication slot')
    parsed = date.fromisoformat(day)
    label = f'{parsed.month}/{parsed.day}'
    text = (Path(__file__).parent / 'approved-post.txt').read_text(encoding='utf-8').rstrip('\n')
    names = '・'.join(item['title'] for item in daily_plan(day))
    hook, hashtags = SLOT_COPY[slot]
    text = text.replace('{date_label}', label).replace('{slot_message}', hook)
    text = text.replace('{puzzle_names}', names).replace('{hashtags}', hashtags)
    text = text.replace('{url_line}', '')
    return text

def weighted_length(text):
    urls = [token for token in text.split() if token.startswith(('http://', 'https://'))]
    without_urls = text
    for url in urls:
        without_urls = without_urls.replace(url, '')
    count = sum(1 if ord(c) <= 0x10ff or 0x2000 <= ord(c) <= 0x200d or 0x2010 <= ord(c) <= 0x201f or 0x2032 <= ord(c) <= 0x2037 else 2 for c in without_urls)
    return count + 23 * len(urls)
