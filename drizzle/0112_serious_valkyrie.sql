CREATE TABLE `authRateLimits` (
	`bucketHash` varchar(64) NOT NULL,
	`scope` enum('login_email','login_ip','reset_email','reset_ip') NOT NULL,
	`attemptCount` int NOT NULL DEFAULT 0,
	`windowStartedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `authRateLimits_bucketHash` PRIMARY KEY(`bucketHash`)
);
--> statement-breakpoint
CREATE INDEX `idx_auth_rate_updated` ON `authRateLimits` (`updatedAt`);