import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { isPublicUrl, publicAllowedOrigins } from "./common/tenant/public-path";

const STAFF_ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-App-Client",
  "Accept",
  "X-User-Id",
  "X-Branch-Id",
  "X-Business-Id",
  "X-Device-Token",
  "X-App-Version",
];

/**
 * HTTP setup shared by main.ts and the e2e tests, so tests exercise the same
 * prefix + CORS rules as production.
 *
 * CORS: staff routes keep the existing permissive policy (the desktop POS and
 * the web apps call from several origins). The guest QR API (/api/public/*) is
 * only callable from the customer web app's origin(s) in WEB_ORIGIN, never
 * with credentials, and accepts no staff/tenant headers.
 */
export function configureApp(app: INestApplication) {
  const express = app as NestExpressApplication;
  // Behind a reverse proxy, set TRUST_PROXY (e.g. "1") so req.ip — which the
  // public rate limiter keys on — is the guest's address, not the proxy's.
  if (process.env.TRUST_PROXY) {
    const v = process.env.TRUST_PROXY;
    express.set("trust proxy", /^\d+$/.test(v) ? Number(v) : v);
  }

  app.enableCors((req: any, cb: (err: Error | null, options: any) => void) => {
    if (isPublicUrl(req.originalUrl ?? req.url)) {
      const allowed = publicAllowedOrigins();
      const origin = req.headers?.origin as string | undefined;
      cb(null, {
        origin: origin ? allowed.includes(origin.replace(/\/+$/, "")) : false,
        credentials: false,
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Accept", "If-None-Match", "X-Customer-Session"],
        exposedHeaders: ["ETag", "Retry-After"],
      });
      return;
    }
    cb(null, {
      origin: "*",
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: STAFF_ALLOWED_HEADERS,
    });
  });
  app.setGlobalPrefix("api");
}
