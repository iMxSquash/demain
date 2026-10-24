CREATE TABLE `import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`format` text NOT NULL,
	`imported_at` text NOT NULL,
	`file_name` text NOT NULL,
	`mapping` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `import_batch_id` integer REFERENCES import_batches(id);--> statement-breakpoint
ALTER TABLE `transactions` ADD `import_fingerprint` text;--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_import_fingerprint_unique` ON `transactions` (`account_id`,`import_fingerprint`) WHERE "transactions"."import_fingerprint" is not null;