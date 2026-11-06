"""Render the approved copy without shortening or splitting it."""
from datetime import date
from pathlib import Path
import re
from daily_plan import daily_plan

def render_text(day,include_url=False,slot='08:00'):
    hooks={'08:00':'朝の頭の体操に、まずは1問！','12:00':'休憩時間に、気軽に1問！','18:00':'今日の気分転換に、パズルはいかが？','21:00':'夜のひと休みに、じっくり挑戦！'}
    if slot not in hooks:raise ValueError('Invalid publication slot')
    parsed=date.fromisoformat(day)
    # Match the publication clock's M/D header on every month/day, including 1-9.
    label=f'{parsed.month}/{parsed.day}'
    text=(Path(__file__).parent/'approved-post.txt').read_text(encoding='utf-8').rstrip('\n')
    text=text.replace('{date_label}',label).replace('{slot_message}',hooks[slot])
    text=text.replace('シルプレ・数独・和同開珎・クロスワード。','・'.join(item['title'] for item in daily_plan(day))+'。')
    if include_url:
        text=text.replace('無料で遊べる「ナンプレ帳」→','無料で遊べる「ナンプレ帳」→\nhttps://atugari.github.io/nanpure/')
    return text

def weighted_length(text):
    without_urls=re.sub(r'https?://\S+','',text)
    count=sum(1 if ord(c)<=0x10ff or 0x2000<=ord(c)<=0x200d or 0x2010<=ord(c)<=0x201f or 0x2032<=ord(c)<=0x2037 else 2 for c in without_urls)
    return count+23*len(re.findall(r'https?://\S+',text))

