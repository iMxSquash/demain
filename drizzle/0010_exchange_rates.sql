CREATE TABLE `exchange_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`base` text NOT NULL,
	`quote` text NOT NULL,
	`rate` integer NOT NULL,
	`source` text NOT NULL,
	CONSTRAINT "exchange_rates_rate_positive" CHECK("exchange_rates"."rate" > 0),
	CONSTRAINT "exchange_rates_distinct_currencies" CHECK("exchange_rates"."base" <> "exchange_rates"."quote")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exchange_rates_pair_date_unique` ON `exchange_rates` (`base`,`quote`,`date`);