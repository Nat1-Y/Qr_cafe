-- Perf: the app previously read entire tables into JS and filtered there
-- (readRows + Array.filter), which turns every "unsynced orders" / "unprinted
-- orders" / "pending payments" lookup into an O(total rows) scan that keeps
-- getting slower as history accumulates (tables are never pruned). These
-- indexes let the equivalent SQL WHERE queries stay fast regardless of table
-- size.
CREATE INDEX `orders_synced_idx` ON `orders` (`synced`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `orders_is_printed_idx` ON `orders` (`is_printed`);--> statement-breakpoint
CREATE INDEX `payments_synced_idx` ON `payments` (`synced`);--> statement-breakpoint
CREATE INDEX `payments_order_id_idx` ON `payments` (`order_id`);--> statement-breakpoint
CREATE INDEX `expenses_synced_idx` ON `expenses` (`synced`);
