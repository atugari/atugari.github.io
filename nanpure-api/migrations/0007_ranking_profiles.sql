-- Only names that were already published become the initial shared nickname.
CREATE TABLE IF NOT EXISTS ranking_profiles (
  player TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  updated INTEGER NOT NULL
);
INSERT OR IGNORE INTO ranking_profiles(player,name,updated)
SELECT player,name,finished FROM (
  SELECT player,name,finished,
    ROW_NUMBER() OVER(PARTITION BY player ORDER BY finished DESC,day DESC,level DESC,id DESC) AS latest
  FROM attempts
  WHERE finished IS NOT NULL AND solved IS NOT NULL
    AND abandoned IS NULL AND excluded IS NULL
    AND name IS NOT NULL AND length(trim(name))>0
) WHERE latest=1;

-- Publish verified current-edition clears without requiring another submission.
-- Keep times, names, exclusions and original attempt identities intact.
UPDATE attempts SET finished=solved
WHERE finished IS NULL AND solved IS NOT NULL
  AND abandoned IS NULL AND excluded IS NULL
  AND typeof(elapsed)='integer' AND elapsed>=5000
  AND length(day)=24 AND substr(day,11)=':cloudflare-v1';
