import { Module } from "@nestjs/common";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { SettingsModule } from "../settings/settings.module";
import { RolePermissionsModule } from "../role-permissions/role-permissions.module";

@Module({
  imports: [SettingsModule, RolePermissionsModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
