import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/app.setup";
import { RateLimiter } from "../../src/modules/customer/rate-limiter";

/** The real AppModule with production HTTP setup, listening on a random port. */
export async function startApp(): Promise<{ app: INestApplication; url: string }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true, logger: ["error"] });
  configureApp(app);
  await app.listen(0);
  const address = app.getHttpServer().address() as { port: number };
  return { app, url: `http://127.0.0.1:${address.port}` };
}

export function resetRateLimits(app: INestApplication) {
  app.get(RateLimiter).reset();
}
