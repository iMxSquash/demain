CREATE TABLE `categorization_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operator` text NOT NULL,
	`value` text NOT NULL,
	`account_id` integer,
	`category_id` integer NOT NULL,
	`priority` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict
);
