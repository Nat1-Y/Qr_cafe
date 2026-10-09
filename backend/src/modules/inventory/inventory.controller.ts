import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { InventoryService } from "./inventory.service";
import { RequirePermission } from "../../common/permissions/require-permission.decorator";

// Transfer routes below override the class-level "inventory" resource with
// their own "transfers" resource/permission (its own row in the roles editor,
// including its own stock-location scope), independent of general inventory
// CRUD access.

@ApiTags("inventory")
@RequirePermission("inventory")
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  async getAll(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
  ) {
    const pageNum = page ? Number(page) : 1;
    const limitNum = limit ? Number(limit) : 50;
    const result = await this.inventoryService.findAll(pageNum, limitNum, search);
    return { status: "success", data: result };
  }

  @RequirePermission("transfers")
  @Get("transfers")
  async getTransfers(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
  ) {
    const pageNum = page ? Number(page) : 1;
    const limitNum = limit ? Number(limit) : 10;
    const result = await this.inventoryService.findTransfers(pageNum, limitNum, {
      status,
      search,
    });
    return { status: "success", data: result };
  }

  @ApiOperation({ summary: "Get full detail for a single stock transfer" })
  @RequirePermission("transfers")
  @Get("transfers/:id")
  async getTransfer(@Param("id") id: string) {
    const transfer = await this.inventoryService.findTransferById(id);
    return { status: "success", data: { transfer } };
  }

  @ApiOperation({
    summary:
      "Branch-wide stock ledger: every deduction/addition with the balance left after each entry",
  })
  @Get("ledger")
  async getLedger(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("movement_type") movementType?: string,
    @Query("location_id") locationId?: string,
    @Query("search") search?: string,
    @Query("date_from") dateFrom?: string,
    @Query("date_to") dateTo?: string,
  ) {
    const result = await this.inventoryService.getLedger({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      movementType,
      locationId,
      search,
      dateFrom,
      dateTo,
    });
    return { status: "success", data: result };
  }

  // Item links (one-to-many transfer relations). Declared before ":id" so
  // "links" isn't captured as an item id.
  @ApiOperation({ summary: "List one-to-many transfer links between items" })
  @Get("links")
  async getLinks() {
    const result = await this.inventoryService.findLinks();
    return { status: "success", data: result };
  }

  @ApiOperation({ summary: "Create or update a transfer link (upserts by source item)" })
  @Post("links")
  async createLink(@Body() body: any) {
    const link = await this.inventoryService.createLink(body);
    return {
      status: "success",
      message: "Item link saved",
      data: { link },
    };
  }

  @Delete("links/:id")
  async deleteLink(@Param("id") id: string) {
    await this.inventoryService.deleteLink(id);
    return { status: "success", message: "Item link removed" };
  }

  @Post()
  async create(@Body() body: any) {
    const item = await this.inventoryService.create(body);
    return {
      status: "success",
      message: "Inventory item created",
      data: { item },
    };
  }

  @ApiOperation({ summary: "Bulk sync inventory items" })
  @Post("sync")
  async bulkSync(@Body() body: any) {
    const data = await this.inventoryService.syncBulk(
      body.inventoryItems || body.items || [],
    );
    return {
      status: "success",
      message: "Inventory items bulk sync successful",
      data,
    };
  }

  @ApiOperation({
    summary: "Per-menu-item availability derived from current stock + recipes",
  })
  @Get("menu-availability")
  async menuAvailability() {
    const items = await this.inventoryService.menuAvailability();
    return { status: "success", data: { items } };
  }

  @ApiOperation({
    summary: "Owner-curated inventory items exposed to waiters, with quantity left",
  })
  @Get("waiter-visible")
  async waiterVisibleItems() {
    const items = await this.inventoryService.getWaiterVisibleItems();
    return { status: "success", data: { items } };
  }

  @Get(":id")
  async getOne(@Param("id") id: string) {
    const item = await this.inventoryService.findOne(id);
    return { status: "success", data: { item } };
  }

  @Put(":id")
  async update(@Param("id") id: string, @Body() body: any) {
    const item = await this.inventoryService.update(id, body);
    return {
      status: "success",
      message: "Inventory item updated",
      data: { item },
    };
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    await this.inventoryService.delete(id);
    return { status: "success", message: "Inventory item deleted" };
  }

  @Put(":id/quantity")
  async updateQuantity(@Param("id") id: string, @Body() body: any) {
    const item = await this.inventoryService.updateQuantity(id, body);
    return {
      status: "success",
      message: "Inventory quantity updated",
      data: { item },
    };
  }

  @Get(":id/movements")
  async getMovements(
    @Param("id") id: string,
    @Query("locationId") locationId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const pageNum = page ? Number(page) : 1;
    const limitNum = limit ? Number(limit) : 20;
    const result = await this.inventoryService.getStockMovements(
      id,
      locationId || undefined,
      pageNum,
      limitNum,
    );
    return { status: "success", data: result };
  }

  @RequirePermission("transfers")
  @Post("transfers")
  async createTransfer(@Body() body: any) {
    const transfer = await this.inventoryService.createTransfer(body);
    return {
      status: "success",
      message: "Stock transfer created",
      data: { transfer },
    };
  }

  @RequirePermission("transfers")
  @Post("transfers/:id/receive")
  async receiveTransfer(@Param("id") id: string, @Body() body: any) {
    const transfer = await this.inventoryService.receiveTransfer(
      id,
      body,
    );
    return {
      status: "success",
      message: "Stock transfer received",
      data: { transfer },
    };
  }

  @Post("check-availability")
  async checkAvailability(@Body() body: any) {
    const result = await this.inventoryService.checkAvailability(
      body.items || [],
    );
    return { status: "success", data: result };
  }
}
