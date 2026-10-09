CREATE TABLE `itemAdditions` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text,
	`added_by` text,
	`added_at` text,
	`printed` integer,
	`synced` integer,
	`raw_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `item_additions_order_id_idx` ON `itemAdditions` (`order_id`);--> statement-breakpoint
CREATE INDEX `item_additions_printed_idx` ON `itemAdditions` (`printed`);--> statement-breakpoint
CREATE INDEX `item_additions_synced_idx` ON `itemAdditions` (`synced`);
