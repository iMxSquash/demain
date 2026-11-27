CREATE TABLE `modifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scenario_id` integer NOT NULL,
	`parent_id` integer,
	`position` integer NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`parameters` text NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `modifications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `modifications_scenario_parent_position` ON `modifications` (`scenario_id`,`parent_id`,`position`);--> statement-breakpoint
CREATE TABLE `scenarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`validated_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `planned_items` ADD `source_scenario_id` integer REFERENCES scenarios(id) ON DELETE set null;