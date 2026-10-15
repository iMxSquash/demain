CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`payment_mode` text,
	`transfer_counterpart_id` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`transfer_counterpart_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
