CREATE TABLE `owner` (
	`id` integer PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`totp_secret` text,
	`totp_last_step` integer,
	`backup_code_hashes` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "owner_single_row" CHECK("owner"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`mfa_pending` integer DEFAULT false NOT NULL
);
