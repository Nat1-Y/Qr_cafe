import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Namespace, Socket } from "socket.io";
import { CustomerAccessService } from "./customer-access.service";
import { CustomerSessionService } from "./customer-session.service";
import { publicAllowedOrigins } from "../../common/tenant/public-path";
import { guestRoom } from "../order/orders.gateway";

/**
 * Live order updates for guests. A guest's phone connects to `/customer` with
 * its table token + session token and joins ONE room: its own session. It is
 * never placed in a branch room, so it can't hear other tables' orders or any
 * staff traffic. OrdersGateway pushes the guest view of an order into that
 * room whenever the order changes (see OrdersGateway.notifyGuest). Clients
 * fall back to polling GET /public/t/:token/orders every 15s if this fails.
 */
@WebSocketGateway({
  namespace: "/customer",
  cors: {
    // Read lazily: dotenv may load after this decorator is evaluated.
    origin: (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) =>
      cb(null, !origin || publicAllowedOrigins().includes(origin.replace(/\/+$/, ""))),
  },
})
export class CustomerGateway implements OnGatewayConnection {
  private readonly logger = new Logger(CustomerGateway.name);

  @WebSocketServer()
  server!: Namespace;

  constructor(
    private readonly access: CustomerAccessService,
    private readonly sessions: CustomerSessionService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const auth = (client.handshake.auth ?? {}) as Record<string, unknown>;
      const table = await this.access.resolve(String(auth.qrToken ?? ""));
      const session = await this.sessions.require(table, String(auth.session ?? ""));
      client.data.sessionId = session.id;
      await client.join(guestRoom(session.id));
    } catch {
      // Bad/rotated token or ended session — the client falls back to polling,
      // which surfaces the friendly message.
      client.disconnect(true);
      return;
    }
    this.logger.debug(`Guest socket ${client.id} joined its session room`);
  }
}
