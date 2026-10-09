CREATE TABLE "branch_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(200),
	"token_hash" varchar(64),
	"code_hash" varchar(64),
	"code_expires_at" timestamp,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"last_seen_at" timestamp,
	"app_version" varchar(40),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "data_cleanup_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"device_id" uuid,
	"device_name" varchar(200),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reason" varchar(500),
	"requested_at" timestamp DEFAULT now(),
	"reviewed_at" timestamp,
	"reviewed_by_user_id" uuid,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_username" varchar(200),
	"action" varchar(64) NOT NULL,
	"target_type" varchar(32),
	"target_id" uuid,
	"target_label" varchar(200),
	"business_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"role" varchar(64) NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "delivery_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(64) NOT NULL,
	"display_name" varchar(128) NOT NULL,
	"icon" varchar(64),
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "couriers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"phone" varchar(32),
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "delivery_order_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"delivery_method_id" uuid NOT NULL,
	"delivery_method_name" varchar(128),
	"courier_name" varchar(128),
	"courier_phone" varchar(32),
	"address" text,
	"fee_cents" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"notes" text,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "delivery_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"delivery_method_id" uuid,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"method" varchar(100),
	"processed_by" uuid,
	"notes" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_counters" (
	"branch_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_item_additions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"added_by" uuid,
	"items" jsonb NOT NULL,
	"added_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inventory_item_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	"target_item_id" uuid NOT NULL,
	"conversion_factor" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"category" varchar(50) NOT NULL,
	"description" text,
	"amount" integer NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"payment_method" varchar(50),
	"expense_date" timestamp DEFAULT now() NOT NULL,
	"recorded_by" uuid,
	"recorded_by_name" varchar(120),
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "staff_penalties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"employee_name" varchar(120),
	"severity" varchar(30) NOT NULL,
	"reason" text NOT NULL,
	"amount" integer,
	"amount_cents" integer DEFAULT 0,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"recorded_by" uuid,
	"recorded_by_name" varchar(120),
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DROP INDEX "users_business_username_idx";--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "enrollment_code" varchar(40);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_number" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_method_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "note" varchar(300);--> statement-breakpoint
ALTER TABLE "sync_events" ADD COLUMN "business_id" uuid;--> statement-breakpoint
ALTER TABLE "sync_events" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "org_credit_transactions" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "branch_devices" ADD CONSTRAINT "branch_devices_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_devices" ADD CONSTRAINT "branch_devices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_cleanup_requests" ADD CONSTRAINT "data_cleanup_requests_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_cleanup_requests" ADD CONSTRAINT "data_cleanup_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_cleanup_requests" ADD CONSTRAINT "data_cleanup_requests_device_id_branch_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."branch_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_methods" ADD CONSTRAINT "delivery_methods_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_methods" ADD CONSTRAINT "delivery_methods_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couriers" ADD CONSTRAINT "couriers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couriers" ADD CONSTRAINT "couriers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_order_details" ADD CONSTRAINT "delivery_order_details_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_order_details" ADD CONSTRAINT "delivery_order_details_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_order_details" ADD CONSTRAINT "delivery_order_details_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_order_details" ADD CONSTRAINT "delivery_order_details_delivery_method_id_delivery_methods_id_fk" FOREIGN KEY ("delivery_method_id") REFERENCES "public"."delivery_methods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_payments" ADD CONSTRAINT "delivery_payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_payments" ADD CONSTRAINT "delivery_payments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_payments" ADD CONSTRAINT "delivery_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_payments" ADD CONSTRAINT "delivery_payments_delivery_method_id_delivery_methods_id_fk" FOREIGN KEY ("delivery_method_id") REFERENCES "public"."delivery_methods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_payments" ADD CONSTRAINT "delivery_payments_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_counters" ADD CONSTRAINT "order_counters_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_additions" ADD CONSTRAINT "order_item_additions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_additions" ADD CONSTRAINT "order_item_additions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_additions" ADD CONSTRAINT "order_item_additions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_additions" ADD CONSTRAINT "order_item_additions_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item_links" ADD CONSTRAINT "inventory_item_links_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item_links" ADD CONSTRAINT "inventory_item_links_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item_links" ADD CONSTRAINT "inventory_item_links_source_item_id_inventory_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item_links" ADD CONSTRAINT "inventory_item_links_target_item_id_inventory_items_id_fk" FOREIGN KEY ("target_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_penalties" ADD CONSTRAINT "staff_penalties_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_penalties" ADD CONSTRAINT "staff_penalties_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_penalties" ADD CONSTRAINT "staff_penalties_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "branch_devices_token_idx" ON "branch_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "branch_devices_code_idx" ON "branch_devices" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "branch_devices_branch_idx" ON "branch_devices" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "data_cleanup_requests_branch_status_idx" ON "data_cleanup_requests" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "data_cleanup_requests_device_idx" ON "data_cleanup_requests" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "platform_audit_created_idx" ON "platform_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "platform_audit_business_idx" ON "platform_audit_logs" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_business_role_idx" ON "role_permissions" USING btree ("business_id","role");--> statement-breakpoint
CREATE INDEX "delivery_methods_active_idx" ON "delivery_methods" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_methods_branch_name_idx" ON "delivery_methods" USING btree ("branch_id","name");--> statement-breakpoint
CREATE INDEX "couriers_active_idx" ON "couriers" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "couriers_branch_name_idx" ON "couriers" USING btree ("branch_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_order_details_order_idx" ON "delivery_order_details" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "delivery_order_details_branch_status_idx" ON "delivery_order_details" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "delivery_order_details_method_idx" ON "delivery_order_details" USING btree ("delivery_method_id");--> statement-breakpoint
CREATE INDEX "delivery_payments_branch_id_idx" ON "delivery_payments" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "delivery_payments_order_id_idx" ON "delivery_payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "delivery_payments_paid_at_idx" ON "delivery_payments" USING btree ("paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_item_links_source_idx" ON "inventory_item_links" USING btree ("branch_id","source_item_id");--> statement-breakpoint
CREATE INDEX "expenses_branch_date_idx" ON "expenses" USING btree ("branch_id","expense_date");--> statement-breakpoint
CREATE INDEX "expenses_branch_category_idx" ON "expenses" USING btree ("branch_id","category");--> statement-breakpoint
CREATE INDEX "staff_penalties_branch_date_idx" ON "staff_penalties" USING btree ("branch_id","occurred_at");--> statement-breakpoint
CREATE INDEX "staff_penalties_branch_employee_idx" ON "staff_penalties" USING btree ("branch_id","employee_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_method_id_delivery_methods_id_fk" FOREIGN KEY ("delivery_method_id") REFERENCES "public"."delivery_methods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_credit_transactions" ADD CONSTRAINT "org_credit_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_branch_username_idx" ON "users" USING btree ("branch_id","username") WHERE "users"."branch_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_fb_manager_username_idx" ON "users" USING btree ("username") WHERE "users"."role" = 'fb_manager';--> statement-breakpoint
CREATE INDEX "orders_branch_id_idx" ON "orders" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "orders_branch_created_idx" ON "orders" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_branch_id_idx" ON "payments" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "payments_order_id_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_paid_at_idx" ON "payments" USING btree ("paid_at");--> statement-breakpoint
CREATE INDEX "sync_events_branch_cursor_idx" ON "sync_events" USING btree ("branch_id","id");--> statement-breakpoint
CREATE INDEX "org_credit_txn_order_idx" ON "org_credit_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_business_username_idx" ON "users" USING btree ("business_id","username") WHERE "users"."branch_id" IS NULL;--> statement-breakpoint
ALTER TABLE "org_credit_transactions" ADD CONSTRAINT "org_credit_transactions_order_id_unique" UNIQUE("order_id");