UPDATE x_four_posts
SET status='assembling'
WHERE status='ready'
  AND due > (CAST(strftime('%s','now') AS INTEGER) * 1000)
  AND meta LIKE '%https://%';

DELETE FROM x_four_images
WHERE post_key IN (
  SELECT key FROM x_four_posts
  WHERE status='assembling'
    AND due > (CAST(strftime('%s','now') AS INTEGER) * 1000)
    AND meta LIKE '%https://%'
);
