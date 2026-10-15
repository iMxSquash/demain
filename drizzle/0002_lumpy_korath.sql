ALTER TABLE `accounts` ADD `deposit_ceiling` integer;--> statement-breakpoint
ALTER TABLE `accounts` ADD `overflow_account_id` integer REFERENCES accounts(id) ON DELETE restrict;