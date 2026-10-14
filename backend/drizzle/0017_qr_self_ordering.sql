CREATE TABLE "customer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_agent_hash" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'ETB' NOT NULL,
	"status" varchar(20) DEFAULT 'created' NOT NULL,
	"provider_ref" varchar(128),
	"checkout_url" text,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "source" varchar(20) DEFAULT 'waiter' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_session_id" uuid;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "qr_token" varchar(64) DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') NOT NULL;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "qr_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "qr_rotated_at" timestamp;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "label" varchar(80);--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_sessions_token_hash_idx" ON "customer_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "customer_sessions_branch_table_idx" ON "customer_sessions" USING btree ("branch_id","table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_provider_ref_idx" ON "payment_intents" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "payment_intents_order_id_idx" ON "payment_intents" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_session_id_customer_sessions_id_fk" FOREIGN KEY ("customer_session_id") REFERENCES "public"."customer_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_branch_source_created_idx" ON "orders" USING btree ("branch_id","source","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dining_tables_qr_token_idx" ON "dining_tables" USING btree ("qr_token");--> statement-breakpoint
-- Backfill (hand-written): existing orders a cashier rang up are 'cashier';
-- everything else keeps the column default 'waiter'. dining_tables.qr_token
-- needs no backfill — its volatile default gives every existing row its own
-- token when the column is added.
UPDATE "orders" SET "source" = 'cashier' WHERE "cashier_id" IS NOT NULL;
