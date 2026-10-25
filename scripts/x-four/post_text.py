"""Render the approved copy without shortening or splitting it."""
from datetime import date
from pathlib import Path
import re

def render_text(day,include_url=False):
    label=date.fromisoformat(day).strftime('%m/%d')
    text=(Path(__file__).parent/'approved-post.txt').read_text(encoding='utf-8').rstrip('\n')
    text=text.replace('{date_label}',label)
    if include_url:
        guide='サイトへは画像に載せたURLかQRコードからどうぞ！'
        text=text.replace(guide,guide+'\nhttps://atugari.github.io/nanpure/')
    return text

def weighted_length(text):
    without_urls=re.sub(r'https?://\S+','',text)
    count=sum(1 if ord(c)<=0x10ff or 0x2000<=ord(c)<=0x200d or 0x2010<=ord(c)<=0x201f or 0x2032<=ord(c)<=0x2037 else 2 for c in without_urls)
    return count+23*len(re.findall(r'https?://\S+',text))
