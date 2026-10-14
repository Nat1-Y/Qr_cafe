import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import * as dotenv from "dotenv";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

async function bootstrap() {
  dotenv.config();
  // rawBody: payment provider webhooks verify signatures over the exact bytes.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Cafe API")
    .setDescription("API documentation for the Café Management System")
    .setVersion("1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  console.log(`🚀 Server listening on http://localhost:${port}`);
}

bootstrap();
