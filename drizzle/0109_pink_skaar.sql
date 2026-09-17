CREATE TABLE `authSecurityEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`eventType` enum('login_success','login_failure','reset_request') NOT NULL,
	`emailHash` varchar(64) NOT NULL,
	`ipHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `authSecurityEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `passwordResetTokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `passwordResetTokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `passwordResetTokens_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE INDEX `idx_auth_event_email_type_date` ON `authSecurityEvents` (`emailHash`,`eventType`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_auth_event_ip_type_date` ON `authSecurityEvents` (`ipHash`,`eventType`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_password_reset_user` ON `passwordResetTokens` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_password_reset_expires` ON `passwordResetTokens` (`expiresAt`);