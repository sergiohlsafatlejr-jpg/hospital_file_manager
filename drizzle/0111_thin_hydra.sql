ALTER TABLE `users` ADD `emailCanonical` varchar(320);--> statement-breakpoint
ALTER TABLE `users` ADD `sessionVersion` int DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `users` u
JOIN (
  SELECT LOWER(TRIM(email)) AS normalizedEmail, COUNT(*) AS identityCount
  FROM `users`
  WHERE email IS NOT NULL AND TRIM(email) <> ''
  GROUP BY LOWER(TRIM(email))
) identities ON identities.normalizedEmail = LOWER(TRIM(u.email))
SET u.emailCanonical = CASE WHEN identities.identityCount = 1 THEN identities.normalizedEmail ELSE NULL END;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_emailCanonical_unique` UNIQUE(`emailCanonical`);
