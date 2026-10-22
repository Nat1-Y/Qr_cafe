CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"owner_user_id" uuid,
	"plan" varchar(50) DEFAULT 'standard' NOT NULL,
	"max_branches" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"parent_branch_id" uuid,
	"name" varchar(200) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"timezone" varchar(64) DEFAULT 'Africa/Addis_Ababa',
	"currency" varchar(8) DEFAULT 'ETB',
	"address" text,
	"phone" varchar(50),
	"enrollment_code" varchar(40),
	"is_active" boolean DEFAULT true NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

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

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid,
	"branch_id" uuid,
	"name" varchar(200) NOT NULL,
	"username" varchar(200),
	"password_hash" text,
	"pin_hash" text,
	"role" varchar(32) NOT NULL,
	"role_id" uuid,
	"first_name" varchar(200),
	"last_name" varchar(200),
	"phone" varchar(50),
	"is_active" boolean DEFAULT true,
	"cancel_password" text,
	"print_copies" varchar(8) DEFAULT '1',
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"display_name" varchar(128) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);

CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"role" varchar(64) NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "payment_methods" (
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

CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"price" numeric(10, 2),
	"category" varchar(100),
	"main_category" varchar(100),
	"type" varchar(50),
	"is_available" boolean DEFAULT true,
	"image_url" text,
	"prep_time_minutes" integer DEFAULT 0,
	"sku" varchar(100),
	"barcode" varchar(100),
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "main_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(220) NOT NULL,
	"icon" varchar(100),
	"display_order" integer DEFAULT 0 NOT NULL,
	"type" varchar(50) DEFAULT 'main' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"meta" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "menu_item_categories" (
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "menu_item_categories_menu_item_id_category_id_pk" PRIMARY KEY("menu_item_id","category_id")
);

CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_number" integer,
	"customer_id" text,
	"organization_id" uuid,
	"is_price_override" boolean DEFAULT false NOT NULL,
	"employee_id" uuid,
	"table_number" integer,
	"waiter_id" uuid,
	"cashier_id" uuid,
	"type" varchar(50),
	"delivery_method_id" uuid,
	"status" varchar(50) NOT NULL,
	"payment_status" varchar(50),
	"total_amount" integer,
	"total_cents" integer DEFAULT 0,
	"notes" text,
	"source" varchar(20) DEFAULT 'waiter' NOT NULL,
	"customer_session_id" uuid,
	"meta" json,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "order_counters" (
	"branch_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"menu_item_id" uuid,
	"menu_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer,
	"unit_price_cents" integer,
	"subtotal" integer,
	"item_type" varchar(50),
	"main_category" varchar(50),
	"note" varchar(300),
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "order_status_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"status" varchar(50) NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp DEFAULT now()
);

CREATE TABLE "order_item_additions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"added_by" uuid,
	"items" jsonb NOT NULL,
	"added_at" timestamp DEFAULT now()
);

CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"amount_cents" integer,
	"amount" integer,
	"method" varchar(50),
	"payment_method" varchar(50),
	"status" varchar(50),
	"processed_by" uuid,
	"description" text,
	"qr_code" text,
	"paid_at" timestamp,
	"meta" json,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "sync_metadata" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" varchar(100) NOT NULL,
	"last_synced_at" timestamp,
	"last_revision" integer
);

CREATE TABLE "sync_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_type" varchar(120) NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" uuid,
	"operation" varchar(20) NOT NULL,
	"business_id" uuid,
	"branch_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"unit" varchar(50) DEFAULT 'piece',
	"base_unit" varchar(50) DEFAULT 'piece',
	"pieces_per_unit" integer DEFAULT 1,
	"min_quantity" integer DEFAULT 0,
	"min_quantity_mode" varchar(20) DEFAULT 'global',
	"notes" text,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

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

CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"inventory_item_id" uuid,
	"movement_type" varchar(50) NOT NULL,
	"location" varchar(50),
	"location_id" uuid,
	"quantity_delta" integer NOT NULL,
	"quantity_after" integer,
	"transfer_id" uuid,
	"order_id" uuid,
	"order_item_id" uuid,
	"notes" text,
	"created_by" uuid,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "stock_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"from_location" varchar(50),
	"to_location" varchar(50),
	"from_location_id" uuid,
	"to_location_id" uuid,
	"status" varchar(50) DEFAULT 'sent' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"received_by" uuid,
	"received_at" timestamp,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "stock_transfer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"transfer_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "stock_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"description" text,
	"location_type" varchar(50) DEFAULT 'storage' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"linked_main_category_slug" varchar(120),
	"meta" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "inventory_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"min_quantity" integer DEFAULT 0
);

CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"yield_quantity" integer DEFAULT 1 NOT NULL,
	"deduct_from_location_id" uuid,
	"deduct_strategy" varchar(50) DEFAULT 'by_menu_category' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"waste_factor" numeric(5, 3) DEFAULT '1.000' NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"notes" text,
	"display_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "system_settings" (
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "system_settings_branch_id_key_pk" PRIMARY KEY("branch_id","key")
);

CREATE TABLE "dining_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"table_number" integer NOT NULL,
	"status" varchar(50) DEFAULT 'available' NOT NULL,
	"qr_token" varchar(64) DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') NOT NULL,
	"qr_enabled" boolean DEFAULT true NOT NULL,
	"qr_rotated_at" timestamp,
	"label" varchar(80),
	"assigned_waiter_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

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

CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"contact_name" varchar(200),
	"phone" varchar(50),
	"email" varchar(200),
	"address" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"credit_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "org_credit_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_date" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "org_credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"payment_id" uuid,
	"order_id" uuid,
	"transaction_date" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "org_credit_transactions_order_id_unique" UNIQUE("order_id")
);

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

ALTER TABLE "branches" ADD CONSTRAINT "branches_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "branches" ADD CONSTRAINT "branches_parent_branch_id_branches_id_fk" FOREIGN KEY ("parent_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "branch_devices" ADD CONSTRAINT "branch_devices_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "branch_devices" ADD CONSTRAINT "branch_devices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "data_cleanup_requests" ADD CONSTRAINT "data_cleanup_requests_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "data_cleanup_requests" ADD CONSTRAINT "data_cleanup_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "data_cleanup_requests" ADD CONSTRAINT "data_cleanup_requests_device_id_branch_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."branch_devices"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "users" ADD CONSTRAINT "users_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "delivery_methods" ADD CONSTRAINT "delivery_methods_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "delivery_methods" ADD CONSTRAINT "delivery_methods_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "couriers" ADD CONSTRAINT "couriers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "couriers" ADD CONSTRAINT "couriers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "delivery_order_details" ADD CONSTRAINT "delivery_order_details_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "delivery_order_details" ADD CONSTRAINT "delivery_order_details_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "delivery_order_details" ADD CONSTRAINT "delivery_order_details_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "delivery_order_details" ADD CONSTRAINT "delivery_order_details_delivery_method_id_delivery_methods_id_fk" FOREIGN KEY ("delivery_method_id") REFERENCES "public"."delivery_methods"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "delivery_payments" ADD CONSTRAINT "delivery_payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "delivery_payments" ADD CONSTRAINT "delivery_payments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "delivery_payments" ADD CONSTRAINT "delivery_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "delivery_payments" ADD CONSTRAINT "delivery_payments_delivery_method_id_delivery_methods_id_fk" FOREIGN KEY ("delivery_method_id") REFERENCES "public"."delivery_methods"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "delivery_payments" ADD CONSTRAINT "delivery_payments_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "main_categories" ADD CONSTRAINT "main_categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "main_categories" ADD CONSTRAINT "main_categories_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "categories" ADD CONSTRAINT "categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "categories" ADD CONSTRAINT "categories_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "menu_item_categories" ADD CONSTRAINT "menu_item_categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "menu_item_categories" ADD CONSTRAINT "menu_item_categories_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "menu_item_categories" ADD CONSTRAINT "menu_item_categories_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "menu_item_categories" ADD CONSTRAINT "menu_item_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_waiter_id_users_id_fk" FOREIGN KEY ("waiter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_cashier_id_users_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_method_id_delivery_methods_id_fk" FOREIGN KEY ("delivery_method_id") REFERENCES "public"."delivery_methods"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_session_id_customer_sessions_id_fk" FOREIGN KEY ("customer_session_id") REFERENCES "public"."customer_sessions"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "order_counters" ADD CONSTRAINT "order_counters_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_id_menu_items_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu_items"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "order_status_logs" ADD CONSTRAINT "order_status_logs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_status_logs" ADD CONSTRAINT "order_status_logs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_status_logs" ADD CONSTRAINT "order_status_logs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_status_logs" ADD CONSTRAINT "order_status_logs_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "order_item_additions" ADD CONSTRAINT "order_item_additions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_item_additions" ADD CONSTRAINT "order_item_additions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_item_additions" ADD CONSTRAINT "order_item_additions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_item_additions" ADD CONSTRAINT "order_item_additions_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_item_links" ADD CONSTRAINT "inventory_item_links_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_item_links" ADD CONSTRAINT "inventory_item_links_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_item_links" ADD CONSTRAINT "inventory_item_links_source_item_id_inventory_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_item_links" ADD CONSTRAINT "inventory_item_links_target_item_id_inventory_items_id_fk" FOREIGN KEY ("target_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_id_stock_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_location_id_stock_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_location_id_stock_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_location_id_stock_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_deduct_from_location_id_stock_locations_id_fk" FOREIGN KEY ("deduct_from_location_id") REFERENCES "public"."stock_locations"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_assigned_waiter_id_users_id_fk" FOREIGN KEY ("assigned_waiter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "org_credit_payments" ADD CONSTRAINT "org_credit_payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "org_credit_payments" ADD CONSTRAINT "org_credit_payments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "org_credit_payments" ADD CONSTRAINT "org_credit_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "org_credit_transactions" ADD CONSTRAINT "org_credit_transactions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "org_credit_transactions" ADD CONSTRAINT "org_credit_transactions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "org_credit_transactions" ADD CONSTRAINT "org_credit_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "org_credit_transactions" ADD CONSTRAINT "org_credit_transactions_payment_id_org_credit_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."org_credit_payments"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "org_credit_transactions" ADD CONSTRAINT "org_credit_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "staff_penalties" ADD CONSTRAINT "staff_penalties_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "staff_penalties" ADD CONSTRAINT "staff_penalties_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "staff_penalties" ADD CONSTRAINT "staff_penalties_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "businesses_slug_idx" ON "businesses" USING btree ("slug");
CREATE INDEX "businesses_active_name_idx" ON "businesses" USING btree ("is_active","name");
CREATE UNIQUE INDEX "branches_business_slug_idx" ON "branches" USING btree ("business_id","slug");
CREATE INDEX "branches_business_active_idx" ON "branches" USING btree ("business_id","is_active");
CREATE UNIQUE INDEX "branch_devices_token_idx" ON "branch_devices" USING btree ("token_hash");
CREATE INDEX "branch_devices_code_idx" ON "branch_devices" USING btree ("code_hash");
CREATE INDEX "branch_devices_branch_idx" ON "branch_devices" USING btree ("branch_id");
CREATE INDEX "data_cleanup_requests_branch_status_idx" ON "data_cleanup_requests" USING btree ("branch_id","status");
CREATE INDEX "data_cleanup_requests_device_idx" ON "data_cleanup_requests" USING btree ("device_id");
CREATE INDEX "platform_audit_created_idx" ON "platform_audit_logs" USING btree ("created_at");
CREATE INDEX "platform_audit_business_idx" ON "platform_audit_logs" USING btree ("business_id");
CREATE UNIQUE INDEX "users_branch_username_idx" ON "users" USING btree ("branch_id","username") WHERE "users"."branch_id" IS NOT NULL;
CREATE UNIQUE INDEX "users_business_username_idx" ON "users" USING btree ("business_id","username") WHERE "users"."branch_id" IS NULL;
CREATE UNIQUE INDEX "users_fb_manager_username_idx" ON "users" USING btree ("username") WHERE "users"."role" = 'fb_manager';
CREATE UNIQUE INDEX "role_permissions_business_role_idx" ON "role_permissions" USING btree ("business_id","role");
CREATE INDEX "payment_methods_active_idx" ON "payment_methods" USING btree ("is_active");
CREATE UNIQUE INDEX "payment_methods_branch_name_idx" ON "payment_methods" USING btree ("branch_id","name");
CREATE INDEX "delivery_methods_active_idx" ON "delivery_methods" USING btree ("is_active");
CREATE UNIQUE INDEX "delivery_methods_branch_name_idx" ON "delivery_methods" USING btree ("branch_id","name");
CREATE INDEX "couriers_active_idx" ON "couriers" USING btree ("is_active");
CREATE UNIQUE INDEX "couriers_branch_name_idx" ON "couriers" USING btree ("branch_id","name");
CREATE UNIQUE INDEX "delivery_order_details_order_idx" ON "delivery_order_details" USING btree ("order_id");
CREATE INDEX "delivery_order_details_branch_status_idx" ON "delivery_order_details" USING btree ("branch_id","status");
CREATE INDEX "delivery_order_details_method_idx" ON "delivery_order_details" USING btree ("delivery_method_id");
CREATE INDEX "delivery_payments_branch_id_idx" ON "delivery_payments" USING btree ("branch_id");
CREATE INDEX "delivery_payments_order_id_idx" ON "delivery_payments" USING btree ("order_id");
CREATE INDEX "delivery_payments_paid_at_idx" ON "delivery_payments" USING btree ("paid_at");
CREATE INDEX "menu_items_available_idx" ON "menu_items" USING btree ("is_available");
CREATE INDEX "menu_items_name_idx" ON "menu_items" USING btree ("name");
CREATE INDEX "menu_items_sku_idx" ON "menu_items" USING btree ("sku");
CREATE INDEX "menu_items_barcode_idx" ON "menu_items" USING btree ("barcode");
CREATE UNIQUE INDEX "main_categories_slug_idx" ON "main_categories" USING btree ("branch_id","slug");
CREATE INDEX "main_categories_active_order_idx" ON "main_categories" USING btree ("is_active","display_order","name");
CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("branch_id","slug");
CREATE INDEX "categories_type_active_order_idx" ON "categories" USING btree ("type","is_active","display_order");
CREATE INDEX "menu_item_categories_category_item_idx" ON "menu_item_categories" USING btree ("category_id","menu_item_id");
CREATE INDEX "menu_item_categories_item_category_idx" ON "menu_item_categories" USING btree ("menu_item_id","category_id");
CREATE INDEX "orders_branch_id_idx" ON "orders" USING btree ("branch_id");
CREATE INDEX "orders_branch_created_idx" ON "orders" USING btree ("branch_id","created_at");
CREATE INDEX "orders_branch_source_created_idx" ON "orders" USING btree ("branch_id","source","created_at");
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");
CREATE INDEX "payments_branch_id_idx" ON "payments" USING btree ("branch_id");
CREATE INDEX "payments_order_id_idx" ON "payments" USING btree ("order_id");
CREATE INDEX "payments_paid_at_idx" ON "payments" USING btree ("paid_at");
CREATE INDEX "sync_events_cursor_idx" ON "sync_events" USING btree ("id");
CREATE INDEX "sync_events_entity_idx" ON "sync_events" USING btree ("entity_type","entity_id");
CREATE INDEX "sync_events_branch_cursor_idx" ON "sync_events" USING btree ("branch_id","id");
CREATE UNIQUE INDEX "inventory_item_links_source_idx" ON "inventory_item_links" USING btree ("branch_id","source_item_id");
CREATE UNIQUE INDEX "stock_locations_slug_idx" ON "stock_locations" USING btree ("branch_id","slug");
CREATE INDEX "stock_locations_active_order_idx" ON "stock_locations" USING btree ("is_active","display_order","name");
CREATE UNIQUE INDEX "inventory_stock_item_location_idx" ON "inventory_stock" USING btree ("branch_id","inventory_item_id","location_id");
CREATE UNIQUE INDEX "recipes_menu_item_active_idx" ON "recipes" USING btree ("branch_id","menu_item_id");
CREATE INDEX "dining_tables_table_number_idx" ON "dining_tables" USING btree ("table_number");
CREATE INDEX "dining_tables_status_idx" ON "dining_tables" USING btree ("status");
CREATE UNIQUE INDEX "dining_tables_qr_token_idx" ON "dining_tables" USING btree ("qr_token");
CREATE UNIQUE INDEX "customer_sessions_token_hash_idx" ON "customer_sessions" USING btree ("token_hash");
CREATE INDEX "customer_sessions_branch_table_idx" ON "customer_sessions" USING btree ("branch_id","table_id");
CREATE UNIQUE INDEX "payment_intents_provider_ref_idx" ON "payment_intents" USING btree ("provider","provider_ref");
CREATE INDEX "payment_intents_order_id_idx" ON "payment_intents" USING btree ("order_id");
CREATE INDEX "organizations_active_name_idx" ON "organizations" USING btree ("is_active","name");
CREATE INDEX "org_credit_payments_org_idx" ON "org_credit_payments" USING btree ("organization_id");
CREATE INDEX "org_credit_txn_org_idx" ON "org_credit_transactions" USING btree ("organization_id");
CREATE INDEX "org_credit_txn_payment_idx" ON "org_credit_transactions" USING btree ("payment_id");
CREATE INDEX "org_credit_txn_order_idx" ON "org_credit_transactions" USING btree ("order_id");
CREATE INDEX "expenses_branch_date_idx" ON "expenses" USING btree ("branch_id","expense_date");
CREATE INDEX "expenses_branch_category_idx" ON "expenses" USING btree ("branch_id","category");
CREATE INDEX "staff_penalties_branch_date_idx" ON "staff_penalties" USING btree ("branch_id","occurred_at");
CREATE INDEX "staff_penalties_branch_employee_idx" ON "staff_penalties" USING btree ("branch_id","employee_id");
