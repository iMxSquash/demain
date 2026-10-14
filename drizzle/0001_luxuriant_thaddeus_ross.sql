CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`currency` text NOT NULL,
	`opening_date` text NOT NULL,
	`opening_balance` integer NOT NULL,
	`archived` integer DEFAULT false NOT NULL
);
