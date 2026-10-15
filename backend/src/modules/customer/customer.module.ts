import { Module } from "@nestjs/common";
import { OrderModule } from "../order/order.module";
import { InventoryModule } from "../inventory/inventory.module";
import { PaymentModule } from "../payment/payment.module";
import { CustomerController } from "./customer.controller";
import { QrSettingsController } from "./qr-settings.controller";
import { CustomerAccessService } from "./customer-access.service";
import { CustomerSessionService } from "./customer-session.service";
import { CustomerMenuService } from "./customer-menu.service";
import { CustomerOrderService } from "./customer-order.service";
import { CustomerGateway } from "./customer.gateway";
import { RateLimiter } from "./rate-limiter";

// Guest QR self-ordering: the public /api/public/* API and the /customer socket.
@Module({
  imports: [OrderModule, InventoryModule, PaymentModule],
  controllers: [CustomerController, QrSettingsController],
  providers: [
    CustomerAccessService,
    CustomerSessionService,
    CustomerMenuService,
    CustomerOrderService,
    CustomerGateway,
    // Factory so Nest doesn't try to inject the optional clock argument.
    { provide: RateLimiter, useFactory: () => new RateLimiter() },
  ],
  exports: [CustomerAccessService],
})
export class CustomerModule {}
