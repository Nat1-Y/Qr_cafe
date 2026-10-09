import { relations } from "drizzle-orm";
import { categories } from "./tables/categories.table";
import { menuItemCategories } from "./tables/menu-item-categories.table";
import { menuItems } from "./tables/menu-items.table";
import { order_items } from "./tables/order-items.table";
import { orderStatusLogs } from "./tables/order-status-logs.table";
import { order_item_additions } from "./tables/order-item-additions.table";
import { orders } from "./tables/orders.table";
import { payments } from "./tables/payments.table";
import { users } from "./tables/users.table";
import { roles } from "./tables/roles.table";
import { recipes } from "./tables/recipes.table";
import { recipeIngredients } from "./tables/recipe-ingredients.table";
import { inventoryItems } from "./tables/inventory-items.table";
import { stockLocations } from "./tables/stock-locations.table";
import { organizations } from "./tables/organizations.table";
import { deliveryMethods } from "./tables/delivery_methods.table";
import { deliveryOrderDetails } from "./tables/delivery-order-details.table";
import { deliveryPayments } from "./tables/delivery-payments.table";

export const usersRelations = relations(users, ({ many, one }) => ({
  employeeOrders: many(orders, { relationName: "employeeOrders" }),
  waiterOrders: many(orders, { relationName: "waiterOrders" }),
  cashierOrders: many(orders, { relationName: "cashierOrders" }),
  processedPayments: many(payments),
  statusChanges: many(orderStatusLogs),
  role: one(roles, {
    fields: [users.role_id],
    references: [roles.id],
    relationName: "userRole",
  }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users, { relationName: "userRole" }),
}));

export const menuItemsRelations = relations(menuItems, ({ many, one }) => ({
  orderItems: many(order_items),
  menuItemCategories: many(menuItemCategories),
  recipe: one(recipes, {
    fields: [menuItems.id],
    references: [recipes.menu_item_id],
  }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  menuItemCategories: many(menuItemCategories),
}));

export const menuItemCategoriesRelations = relations(
  menuItemCategories,
  ({ one }) => ({
    menuItem: one(menuItems, {
      fields: [menuItemCategories.menu_item_id],
      references: [menuItems.id],
    }),
    category: one(categories, {
      fields: [menuItemCategories.category_id],
      references: [categories.id],
    }),
  }),
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  employee: one(users, {
    fields: [orders.employee_id],
    references: [users.id],
    relationName: "employeeOrders",
  }),
  waiter: one(users, {
    fields: [orders.waiter_id],
    references: [users.id],
    relationName: "waiterOrders",
  }),
  cashier: one(users, {
    fields: [orders.cashier_id],
    references: [users.id],
    relationName: "cashierOrders",
  }),
  organization: one(organizations, {
    fields: [orders.organization_id],
    references: [organizations.id],
  }),
  deliveryMethod: one(deliveryMethods, {
    fields: [orders.delivery_method_id],
    references: [deliveryMethods.id],
  }),
  deliveryDetails: one(deliveryOrderDetails, {
    fields: [orders.id],
    references: [deliveryOrderDetails.order_id],
  }),
  deliveryPayments: many(deliveryPayments),
  items: many(order_items),
  payments: many(payments),
  statusLogs: many(orderStatusLogs),
  itemAdditions: many(order_item_additions),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  orders: many(orders),
}));

export const deliveryMethodsRelations = relations(
  deliveryMethods,
  ({ many }) => ({
    orders: many(orders),
    deliveryDetails: many(deliveryOrderDetails),
  }),
);

export const deliveryOrderDetailsRelations = relations(
  deliveryOrderDetails,
  ({ one }) => ({
    order: one(orders, {
      fields: [deliveryOrderDetails.order_id],
      references: [orders.id],
    }),
    deliveryMethod: one(deliveryMethods, {
      fields: [deliveryOrderDetails.delivery_method_id],
      references: [deliveryMethods.id],
    }),
  }),
);

export const deliveryPaymentsRelations = relations(
  deliveryPayments,
  ({ one }) => ({
    order: one(orders, {
      fields: [deliveryPayments.order_id],
      references: [orders.id],
    }),
    deliveryMethod: one(deliveryMethods, {
      fields: [deliveryPayments.delivery_method_id],
      references: [deliveryMethods.id],
    }),
    processedBy: one(users, {
      fields: [deliveryPayments.processed_by],
      references: [users.id],
    }),
  }),
);

export const orderItemsRelations = relations(order_items, ({ one }) => ({
  order: one(orders, {
    fields: [order_items.order_id],
    references: [orders.id],
  }),
  menuItemByMenuItemId: one(menuItems, {
    fields: [order_items.menu_item_id],
    references: [menuItems.id],
    relationName: "orderItemsByMenuItemId",
  }),
  menuItemByMenuId: one(menuItems, {
    fields: [order_items.menu_id],
    references: [menuItems.id],
    relationName: "orderItemsByMenuId",
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.order_id],
    references: [orders.id],
  }),
  processedBy: one(users, {
    fields: [payments.processed_by],
    references: [users.id],
  }),
}));

export const orderStatusLogsRelations = relations(
  orderStatusLogs,
  ({ one }) => ({
    order: one(orders, {
      fields: [orderStatusLogs.order_id],
      references: [orders.id],
    }),
    changedBy: one(users, {
      fields: [orderStatusLogs.changed_by],
      references: [users.id],
    }),
  }),
);

export const orderItemAdditionsRelations = relations(
  order_item_additions,
  ({ one }) => ({
    order: one(orders, {
      fields: [order_item_additions.order_id],
      references: [orders.id],
    }),
    addedBy: one(users, {
      fields: [order_item_additions.added_by],
      references: [users.id],
    }),
  }),
);

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  menuItem: one(menuItems, {
    fields: [recipes.menu_item_id],
    references: [menuItems.id],
  }),
  stockLocation: one(stockLocations, {
    fields: [recipes.deduct_from_location_id],
    references: [stockLocations.id],
  }),
  recipeIngredients: many(recipeIngredients),
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeIngredients.recipe_id],
    references: [recipes.id],
  }),
  inventoryItem: one(inventoryItems, {
    fields: [recipeIngredients.inventory_item_id],
    references: [inventoryItems.id],
  }),
}));
