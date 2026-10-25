"""Resolve the four Japan-time publication slots, including delayed jobs."""
from datetime import date,datetime,timedelta
from zoneinfo import ZoneInfo

SLOTS=('08:00','12:00','18:00','21:00')
CRON_TO_SLOT={f'0 {int(slot[:2])} * * *':slot for slot in SLOTS}

def publication_key(day,slot=None):
    date.fromisoformat(day)
    if slot is None:return day  # Read existing once-a-day history safely.
    if slot not in SLOTS:raise ValueError('Invalid publication slot')
    return day+'@'+slot

def resolve_slot(now,*,schedule='',requested='08:00'):
    if now.tzinfo is None:raise ValueError('A timezone-aware current time is required')
    local=now.astimezone(ZoneInfo('Asia/Tokyo'))
    if schedule:
        if schedule not in CRON_TO_SLOT:raise ValueError('Unknown schedule')
        slot=CRON_TO_SLOT[schedule]
        day=local.date()
        # A late 21:00 job starting after midnight still belongs to yesterday.
        if (local.hour,local.minute)<(int(slot[:2]),int(slot[3:])):day-=timedelta(days=1)
    else:
        if requested not in SLOTS:raise ValueError('Invalid publication slot')
        slot=requested;day=local.date()
    return day.isoformat(),slot
