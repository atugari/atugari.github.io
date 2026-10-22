-- Additive only. Scores are calculated from existing published daily attempts;
-- no records, player credentials, or historical editions are changed.
CREATE INDEX IF NOT EXISTS attempt_public_score
ON attempts(day, player, level, elapsed)
WHERE finished IS NOT NULL AND solved IS NOT NULL
  AND abandoned IS NULL AND excluded IS NULL;
