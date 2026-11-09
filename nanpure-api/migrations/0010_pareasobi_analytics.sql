-- Additive Pareasobi analytics. Stores only daily-hashed visitor/session IDs and aggregateable events.
CREATE TABLE IF NOT EXISTS pareasobi_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  day TEXT NOT NULL,
  game TEXT NOT NULL,
  page TEXT NOT NULL,
  screen TEXT NOT NULL,
  event TEXT NOT NULL,
  visitor TEXT NOT NULL,
  session TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pareasobi_events_day_game ON pareasobi_events(day,game,event);
CREATE INDEX IF NOT EXISTS pareasobi_events_day_page ON pareasobi_events(day,page,event);
CREATE INDEX IF NOT EXISTS pareasobi_events_day_screen ON pareasobi_events(day,game,screen,event);
