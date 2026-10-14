import { Module } from "@nestjs/common";
import { PaymentService } from "./payment.service";
import { PaymentController } from "./payment.controller";
import { OrderModule } from "../order/order.module";
import { PaymentProviderRegistry } from "./providers/payment-provider.registry";
import { PaymentIntentsService } from "./providers/payment-intents.service";

@Module({
  imports: [OrderModule],
  providers: [PaymentService, PaymentProviderRegistry, PaymentIntentsService],
  controllers: [PaymentController],
  exports: [PaymentService, PaymentProviderRegistry, PaymentIntentsService],
})
export class PaymentModule {}
