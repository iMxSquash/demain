CREATE TABLE `occurrence_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`planned_item_id` integer NOT NULL,
	`nominal_date` text NOT NULL,
	`status` text NOT NULL,
	`override_date` text,
	`override_amount` integer,
	FOREIGN KEY (`planned_item_id`) REFERENCES `planned_items`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_overrides_item_nominal_unique` ON `occurrence_overrides` (`planned_item_id`,`nominal_date`);--> statement-breakpoint
CREATE TABLE `planned_item_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`planned_item_id` integer NOT NULL,
	`effective_from` text NOT NULL,
	`repetition_kind` text,
	`repetition_value` integer,
	`business_day_rule` text DEFAULT 'none' NOT NULL,
	`amount` integer NOT NULL,
	`amount_mode` text DEFAULT 'fixed' NOT NULL,
	`average_window` integer DEFAULT 3 NOT NULL,
	FOREIGN KEY (`planned_item_id`) REFERENCES `planned_items`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planned_item_versions_item_effective_unique` ON `planned_item_versions` (`planned_item_id`,`effective_from`);--> statement-breakpoint
CREATE TABLE `planned_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`account_id` integer NOT NULL,
	`destination_account_id` integer,
	`category_id` integer,
	`start_date` text NOT NULL,
	`end_date` text,
	`accepts_multiple_transactions` integer DEFAULT false NOT NULL,
	`provision_label_filter` text,
	`match_window_days` integer DEFAULT 5 NOT NULL,
	`match_amount_tolerance_bp` integer DEFAULT 500 NOT NULL,
	`cancelled` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`destination_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `planned_item_id` integer REFERENCES `planned_items`(`id`) ON UPDATE no action ON DELETE restrict;--> statement-breakpoint
ALTER TABLE `transactions` ADD `occurrence_date` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `category_from_planned_item` integer DEFAULT false NOT NULL;