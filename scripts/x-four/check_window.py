"""Reject expired scheduled runs before installing dependencies or contacting X."""
import os
from datetime import datetime
from zoneinfo import ZoneInfo
from post_schedule import resolve_slot,is_current_slot

now=datetime.now(ZoneInfo('Asia/Tokyo'))
schedule=os.environ.get('X_FOUR_SCHEDULE','')
allowed=True
if schedule:
    day,slot=resolve_slot(now,schedule=schedule)
    allowed=is_current_slot(now,day,slot)
    print('Scheduled slot: '+day+' '+slot+' JST; started: '+now.isoformat(timespec='seconds'))
    print('Publication window open.' if allowed else 'Skipped expired slot. No X API request or catch-up post will be made.')
if os.environ.get('GITHUB_OUTPUT'):
    with open(os.environ['GITHUB_OUTPUT'],'a') as output:output.write('allowed='+str(allowed).lower()+'\n')
