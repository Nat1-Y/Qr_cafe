import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiBody,
  ApiOperation,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { OrderService } from "./order.service";
import { ZReportService } from "./z-report.service";
import {
  OrderItemsUpdateDto,
  OrderRequestDto,
  OrderResponseDto,
  OrderStatusHistoryResponseDto,
  OrderItemAdditionsResponseDto,
  OrderStatusUpdateDto,
  OrdersResponseDto,
  BulkSyncRequestDto,
  BulkSyncResponseDto,
} from "./dto/order.dto";
import db from "../../db/drizzle";
import { syncEvents } from "../../db/tables/sync-events.table";
import { desc, gt } from "drizzle-orm";
import { RequirePermission } from "../../common/permissions/require-permission.decorator";
import { requireBranchId } from "../../common/tenant/tenant-context";
import {
  parseDateBoundInZone,
  resolveBranchTimezone,
  todayInZone,
} from "../../common/time/branch-timezone";

@ApiTags("orders")
@RequirePermission("orders")
@Controller("orders")
export class OrderController {
  constructor(
    private orderService: OrderService,
    private zReportService: ZReportService,
  ) {}

  @ApiOperation({ summary: "Create a new order" })
  @ApiBody({ type: OrderRequestDto })
  @ApiOkResponse({ type: OrderResponseDto })
  @Post()
  async createOrder(@Body() body: OrderRequestDto) {
    const order = await this.orderService.create(body);
    return {
      status: "success",
      message: "Order created successfully",
    };
  }

  @ApiOperation({ summary: "Bulk sync orders and payments" })
  @ApiBody({ type: BulkSyncRequestDto })
  @ApiOkResponse({ type: BulkSyncResponseDto })
  @Post("sync")
  async bulkSync(@Body() body: BulkSyncRequestDto) {
    const data = await this.orderService.bulkSync(body);
    return {
      status: "success",
      message: "Bulk sync processed successfully",
      data,
    };
  }

  @ApiOperation({ summary: "List orders (paginated, date-windowed)" })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "type", required: false })
  @ApiQuery({ name: "employee_id", required: false })
  @ApiQuery({ name: "table_number", required: false })
  @ApiQuery({ name: "date_from", required: false })
  @ApiQuery({ name: "date_to", required: false })
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "page", required: false, description: "1-based page number" })
  @ApiQuery({ name: "limit", required: false, description: "Page size (max 100)" })
  @ApiQuery({
    name: "exclude_delivery",
    required: false,
    description: "Drop orders placed through a delivery method — used by the dashboard Orders page",
  })
  @ApiQuery({
    name: "exclude_organization",
    required: false,
    description: "Drop orders attributed to an organization — used by the dashboard Orders page",
  })
  @ApiOkResponse({ type: OrdersResponseDto })
  @Get()
  async getAllOrders(@Query() query: any) {
    const filters: any = {};
    [
      "status",
      "type",
      "employee_id",
      "table_number",
      "paid",
      "date_from",
      "date_to",
      "search",
      "page",
      "limit",
      "sort_by",
      "sort_dir",
      "exclude_delivery",
      "exclude_organization",
    ].forEach((k) => {
      if (query[k]) filters[k] = query[k];
    });
    const result = await this.orderService.findAllPaged(filters);
    return { status: "success", data: result };
  }

  @ApiOperation({ summary: "List orders placed through a delivery method" })
  @ApiQuery({ name: "status", required: false, description: "pending | delivered | cancelled" })
  // Guarded by its own resource so the delivery board can be granted
  // independently of general order access (see `deliveries` in
  // permissions.constants.ts).
  @RequirePermission("deliveries")
  @Get("deliveries")
  async listDeliveries(@Query("status") status?: string) {
    const deliveries = await this.orderService.listDeliveries({ status });
    return {
      status: "success",
      data: { orders: deliveries, count: deliveries.length },
    };
  }

  @ApiOperation({
    summary:
      "Update a delivery order's courier/address/fee/notes and its own pending/delivered/cancelled progress",
  })
  @ApiParam({ name: "id", required: true })
  @RequirePermission("deliveries")
  @Put(":id/delivery")
  async updateDeliveryDetails(@Param("id") id: string, @Body() body: any) {
    const updated = await this.orderService.updateDeliveryDetails(id, body);
    return {
      status: "success",
      message: "Delivery updated successfully",
      data: { delivery: updated },
    };
  }

  @ApiOperation({
    summary:
      "Record a delivery payment entry (courier cash, platform remittance, …) — separate from the normal payments table",
  })
  @ApiParam({ name: "id", required: true })
  @RequirePermission("deliveries")
  @Post(":id/delivery-payments")
  async addDeliveryPayment(@Param("id") id: string, @Body() body: any) {
    const payment = await this.orderService.addDeliveryPayment(id, body);
    return {
      status: "success",
      message: "Delivery payment recorded",
      data: { delivery_payment: payment },
    };
  }

  @ApiOperation({ summary: "Update a delivery payment entry" })
  @ApiParam({ name: "id", required: true })
  @ApiParam({ name: "paymentId", required: true })
  @RequirePermission("deliveries")
  @Put(":id/delivery-payments/:paymentId")
  async updateDeliveryPayment(
    @Param("id") id: string,
    @Param("paymentId") paymentId: string,
    @Body() body: any,
  ) {
    const payment = await this.orderService.updateDeliveryPayment(
      id,
      paymentId,
      body,
    );
    return {
      status: "success",
      message: "Delivery payment updated",
      data: { delivery_payment: payment },
    };
  }

  @ApiOperation({ summary: "Stream new order events" })
  @Get("stream")
  async streamNewOrders(@Req() req: any, @Res() res: any) {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    let closed = false;
    let pollTimer: any = null;
    const heartbeat = setInterval(() => {
      if (closed) return;
      try {
        res.write(": ping\n\n");
      } catch {
        cleanup();
      }
    }, 15000);

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      if (pollTimer) clearTimeout(pollTimer);
      try {
        res.end();
      } catch {
        // ignore
      }
    };

    req.on("close", cleanup);
    req.on("aborted", cleanup);

    let cursor = 0;
    try {
      const [latest] = await db
        .select({ id: syncEvents.id })
        .from(syncEvents)
        .orderBy(desc(syncEvents.id))
        .limit(1);
      cursor = latest?.id ?? 0;
    } catch {
      cursor = 0;
    }

    const poll = async () => {
      if (closed) return;

      try {
        const rows = await db
          .select()
          .from(syncEvents)
          .where(gt(syncEvents.id, cursor))
          .orderBy(desc(syncEvents.id))
          .limit(1);

        if (rows.length > 0) {
          const eventRow = rows[0];
          cursor = eventRow.id;

          if (eventRow.event_type === "ORDER_CREATED") {
            res.write("event: new_order\n");
            res.write(
              `data: ${JSON.stringify({
                id: eventRow.id,
                entityType: eventRow.entity_type,
                entityId: eventRow.entity_id,
                payload: eventRow.payload,
                createdAt: eventRow.created_at,
              })}\n\n`,
            );
          }
        }
      } catch {
        // ignore transient polling errors; the next tick may recover
      }

      if (!closed) {
        pollTimer = setTimeout(poll, 3000);
      }
    };

    pollTimer = setTimeout(poll, 0);
  }

  @ApiOperation({ summary: "Update the status of an order" })
  @ApiParam({ name: "id", required: true })
  @ApiBody({ type: OrderStatusUpdateDto })
  @ApiOkResponse({ type: OrderResponseDto })
  @Put(":id/status")
  async updateOrderStatus(
    @Param("id") id: string,
    @Body() body: OrderStatusUpdateDto,
  ) {
    const updated = await this.orderService.updateStatus(
      id,
      body.status,
      body.updated_by,
    );
    return {
      status: "success",
      message: "Order status updated successfully",
      data: { order: updated },
    };
  }

  @ApiOperation({
    summary:
      "Cancel (void) an order from the back office — voids its payments and reverses stock",
  })
  @ApiParam({ name: "id", required: true })
  @ApiBody({ type: OrderStatusUpdateDto })
  @ApiOkResponse({ type: OrderResponseDto })
  // Guarded by its own resource so cancellation can be granted per-role
  // independently of ordinary order access. DELETE → the "delete" action on the
  // "order_cancellation" resource. The desktop POS carries no back-office role
  // and is exempt from the permissions guard, so its own cancel flow is
  // unaffected; this endpoint governs the web dashboard only.
  @RequirePermission("order_cancellation")
  @Delete(":id/cancel")
  async cancelOrder(
    @Param("id") id: string,
    @Body() body: OrderStatusUpdateDto,
  ) {
    const updated = await this.orderService.cancelOrder(id, body?.updated_by);
    return {
      status: "success",
      message: "Order cancelled successfully",
      data: { order: updated },
    };
  }

  @ApiOperation({
    summary:
      "Confirm an organization-attributed order (owner only) — this is when the credit deduction actually posts, not at order creation. Never touches `payments`.",
  })
  @ApiParam({ name: "id", required: true })
  // No route-level @RequirePermission override here on purpose — this inherits
  // only the controller's blanket "orders" write gate, not a dedicated,
  // owner-delegable resource. The real owner-only check happens inside the
  // service against the confirming user's actual role (isAllAccessRole),
  // which works the same for a JWT-carrying web session and a roleless
  // device-token request from the desktop app — see
  // order.service.ts's confirmOrganizationOrderPayment.
  @Post(":id/organization-payment/confirm")
  async confirmOrganizationOrderPayment(
    @Param("id") id: string,
    @Body() body: { confirmed_by?: string },
  ) {
    const result = await this.orderService.confirmOrganizationOrderPayment(
      id,
      body?.confirmed_by,
    );
    return {
      status: "success",
      message: "Organization order payment confirmed",
      data: result,
    };
  }

  @ApiOperation({ summary: "Get the status history for an order" })
  @ApiParam({ name: "id", required: true })
  @ApiOkResponse({ type: OrderStatusHistoryResponseDto })
  @Get(":id/status-history")
  async getOrderStatusHistory(@Param("id") id: string) {
    const history = await this.orderService.getStatusHistory(id);
    return { status: "success", data: { statusHistory: history } };
  }

  @ApiOperation({ summary: "Get the item-addition audit trail for an order" })
  @ApiParam({ name: "id", required: true })
  @ApiOkResponse({ type: OrderItemAdditionsResponseDto })
  @Get(":id/item-additions")
  async getOrderItemAdditions(@Param("id") id: string) {
    const itemAdditions = await this.orderService.getItemAdditions(id);
    return { status: "success", data: { itemAdditions } };
  }

  @ApiOperation({ summary: "Get pending orders" })
  @ApiQuery({ name: "type", required: false })
  @ApiOkResponse({ type: OrdersResponseDto })
  @Get("pending")
  async getPendingOrders(@Query("type") type: string) {
    const orders = await this.orderService.getPendingOrders(type);
    return { status: "success", data: { orders, count: orders.length } };
  }

  @ApiOperation({ summary: "Get ready orders" })
  @ApiQuery({ name: "type", required: false })
  @ApiOkResponse({ type: OrdersResponseDto })
  @Get("ready")
  async getReadyOrders(@Query("type") type: string) {
    const orders = await this.orderService.getReadyOrders(type);
    return { status: "success", data: { orders, count: orders.length } };
  }

  @ApiOperation({ summary: "Create a cafe order" })
  @ApiBody({ type: OrderRequestDto })
  @ApiOkResponse({ type: OrderResponseDto })
  @Post("cafe")
  async createCafeOrder(@Body() body: OrderRequestDto) {
    const order = await this.orderService.createCafeOrder(body);
    return {
      status: "success",
      message: "Cafe order created successfully",
      data: { order },
    };
  }

  @ApiOperation({ summary: "Get kitchen orders" })
  @ApiOkResponse({ type: OrdersResponseDto })
  @Get("kitchen")
  async getKitchenOrders() {
    const orders = await this.orderService.getKitchenOrders();
    return { status: "success", data: { orders, count: orders.length } };
  }

  @ApiOperation({ summary: "Mark an order as ready" })
  @ApiParam({ name: "id", required: true })
  @ApiBody({ type: OrderStatusUpdateDto })
  @ApiOkResponse({ type: OrderResponseDto })
  @Post(":id/mark-ready")
  async markOrderReady(
    @Param("id") id: string,
    @Body() body: OrderStatusUpdateDto,
  ) {
    const updated = await this.orderService.markOrderReady(
      id,
      body.updated_by,
    );
    return {
      status: "success",
      message: "Order marked as ready",
      data: { order: updated },
    };
  }

  @ApiOperation({ summary: "Mark an order as completed" })
  @ApiParam({ name: "id", required: true })
  @ApiBody({ type: OrderStatusUpdateDto })
  @ApiOkResponse({ type: OrderResponseDto })
  @Post(":id/complete")
  async completeOrder(
    @Param("id") id: string,
    @Body() body: OrderStatusUpdateDto,
  ) {
    const updated = await this.orderService.completeOrder(
      id,
      body.completed_by,
    );
    return {
      status: "success",
      message: "Order completed",
      data: { order: updated },
    };
  }

  @ApiOperation({ summary: "List orders ready for payment" })
  @ApiQuery({ name: "employee_id", required: false })
  @ApiOkResponse({ type: OrdersResponseDto })
  @Get("for-payment")
  async getOrdersForPayment(@Query() query: any) {
    const filters: any = {};
    if (query.employee_id) filters.employee_id = query.employee_id;
    const orders = await this.orderService.getOrdersForPayment(filters);
    return { status: "success", data: { orders, count: orders.length } };
  }

  @ApiOperation({
    summary:
      "Active orders awaiting payment, with per-department dues for the cashier portal",
  })
  @ApiQuery({
    name: "departments",
    required: false,
    description: "Comma-separated departments to scope the queue to",
  })
  @ApiOkResponse({ type: OrdersResponseDto })
  @Get("cashier-queue")
  async getCashierQueue(@Query() query: any) {
    const departments = String(query.departments || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const orders = await this.orderService.getCashierQueue({
      departments,
      employee_id: query.employee_id || undefined,
    });
    return { status: "success", data: { orders, count: orders.length } };
  }

  @ApiOperation({ summary: "Update the items for an order" })
  @ApiParam({ name: "id", required: true })
  @ApiBody({ type: OrderItemsUpdateDto })
  @ApiOkResponse({ type: OrderResponseDto })
  @Put(":id/items")
  async updateOrderItems(
    @Param("id") id: string,
    @Body() body: OrderItemsUpdateDto,
  ) {
    const updated = await this.orderService.updateOrderItems(
      id,
      body.items,
      body.updated_by,
    );
    return {
      status: "success",
      message: "Order items updated successfully",
      data: { order: updated },
    };
  }

  @ApiOperation({ summary: "Add items to an order" })
  @ApiParam({ name: "id", required: true })
  @ApiBody({ type: OrderItemsUpdateDto })
  @ApiOkResponse({ type: OrderResponseDto })
  @Post(":id/items")
  async addOrderItems(
    @Param("id") id: string,
    @Body() body: OrderItemsUpdateDto,
  ) {
    const updated = await this.orderService.addOrderItems(
      id,
      body.items,
      body.updated_by,
      body.addition_id,
    );
    return {
      status: "success",
      message: "Items added to order successfully",
      data: { order: updated },
    };
  }

  // Not a general-purpose "edit a paid order" route — only the desktop
  // client's own sync layer calls this, and only to retry an addition it
  // already tried (and got rejected) via the route above. See
  // OrderService.reconcileOrderItems for why this exists and what it
  // deliberately doesn't do (flag/track the resulting shortfall).
  @ApiOperation({ summary: "Apply an item addition to an order despite it already being paid (sync reconciliation only)" })
  @ApiParam({ name: "id", required: true })
  @ApiBody({ type: OrderItemsUpdateDto })
  @ApiOkResponse({ type: OrderResponseDto })
  @Post(":id/items/reconcile")
  async reconcileOrderItems(
    @Param("id") id: string,
    @Body() body: OrderItemsUpdateDto,
  ) {
    const updated = await this.orderService.reconcileOrderItems(
      id,
      body.items,
      body.updated_by,
      body.addition_id,
    );
    return {
      status: "success",
      message: "Items reconciled onto order successfully",
      data: { order: updated },
    };
  }

  @ApiOperation({ summary: "Get orders by type" })
  @ApiParam({ name: "orderType", required: true })
  @ApiOkResponse({ type: OrdersResponseDto })
  @Get("type/:orderType")
  async getOrdersByType(@Param("orderType") orderType: string) {
    const orders = await this.orderService.getOrdersByType(orderType);
    return { status: "success", data: { orders, count: orders.length } };
  }

  @ApiOperation({ summary: "Mark food items on an order as ready" })
  @ApiParam({ name: "id", required: true })
  @ApiOkResponse({ type: OrderResponseDto })
  @Post(":id/mark-food-ready")
  async markFoodReady(@Param("id") id: string) {
    const order = await this.orderService.markFoodReady(id);
    return {
      status: "success",
      message: "Food items marked as ready",
      data: { order },
    };
  }

  @ApiOperation({ summary: "Get occupied tables" })
  @ApiOkResponse({
    schema: {
      type: "object",
      properties: {
        status: { type: "string" },
        data: {
          type: "object",
          properties: {
            occupiedTables: { type: "array", items: { type: "object" } },
            count: { type: "number" },
          },
        },
      },
    },
  })
  @Get("occupied-tables")
  async getOccupiedTables() {
    const tables = await this.orderService.getOccupiedTables();
    return {
      status: "success",
      data: { occupiedTables: tables, count: tables.length },
    };
  }

  @ApiOperation({
    summary:
      "Backfill payment rows for orders stuck 'paid' with no matching payment (offline-sync gap recovery)",
  })
  @ApiQuery({
    name: "grace_minutes",
    required: false,
    description: "Only touch orders paid at least this long ago (default 10)",
  })
  @Post("reconcile-orphan-payments")
  async reconcileOrphanPayments(@Query("grace_minutes") graceMinutes?: string) {
    const grace = Number(graceMinutes);
    const result = await this.orderService.reconcileOrphanPaidOrders(
      Number.isFinite(grace) && grace >= 0 ? grace : undefined,
    );
    return {
      status: "success",
      message:
        result.reconciled.length > 0
          ? `Backfilled ${result.reconciled.length} missing payment(s)`
          : "No orphaned paid orders found",
      data: result,
    };
  }

  @ApiOperation({ summary: "Generate Z-report for a date range" })
  @ApiQuery({ name: "start_date", required: false, description: "ISO date string (YYYY-MM-DD)" })
  @ApiQuery({ name: "end_date", required: false, description: "ISO date string (YYYY-MM-DD)" })
  @Get("z-report")
  async getZReport(@Query() query: any) {
    const { start_date, end_date } = query;

    // Day boundaries must resolve against the branch's own timezone, not the
    // server process's ambient one — see branch-timezone.ts. Previously this
    // used `new Date(y, m-1, d, ...)`, which the language defines as *local
    // system* time, silently shifting every report window by the gap between
    // the server's timezone and the branch's.
    const timeZone = await resolveBranchTimezone(requireBranchId());
    const startDateStr = start_date || todayInZone(timeZone);
    const endDateStr = end_date || startDateStr;

    const startDate = parseDateBoundInZone(startDateStr, timeZone, false);
    const endDate = parseDateBoundInZone(endDateStr, timeZone, true);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return { status: "error", message: "Invalid date format" };
    }

    const zReport = await this.zReportService.generateZReport(startDate, endDate);
    return {
      status: "success",
      data: { zReport },
    };
  }

  @ApiOperation({
    summary: "Get items-added-to-order events across the branch (catch-up feed)",
  })
  @ApiQuery({ name: "date_from", required: false })
  @ApiOkResponse({ type: OrderItemAdditionsResponseDto })
  @Get("item-additions")
  async getBranchItemAdditions(@Query("date_from") dateFrom?: string) {
    const itemAdditions = await this.orderService.getItemAdditionsSince(dateFrom);
    return { status: "success", data: { itemAdditions } };
  }

  @ApiOperation({ summary: "Get an order by ID" })
  @ApiParam({ name: "id", required: true })
  @ApiOkResponse({ type: OrderResponseDto })
  @Get(":id")
  async getOrder(@Param("id") id: string) {
    const order = await this.orderService.findById(id);
    if (!order) return { status: "error", message: "Order not found" };
    return { status: "success", data: { order } };
  }
}
