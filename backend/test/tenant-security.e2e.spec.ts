// M9: requests with neither a device token nor a JWT can no longer pick a
// branch with x-branch-id (or fall back to the default branch).
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { io } from "socket.io-client";
import { pool } from "../src/db/drizzle";
import { startApp } from "./helpers/app";
import { BranchFixture, seedBranch } from "./helpers/fixtures";

let app: INestApplication;
let url: string;
let A: BranchFixture;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  ({ app, url } = await startApp());
  A = await seedBranch();
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("tenant hole closed", () => {
  it.each([
    ["GET", "/api/orders"],
    ["GET", "/api/payments/history"],
    ["GET", "/api/menu"],
    ["GET", "/api/users"],
    ["GET", "/api/sync/changes"],
    ["POST", "/api/orders/cafe"],
    ["PUT", "/api/auth/profile/00000000-0000-0000-0000-000000000000"],
    ["POST", "/api/auth/register"],
  ])("%s %s with only x-branch-id is refused", async (method, path) => {
    const req = method === "GET" ? http().get(path) : method === "PUT" ? http().put(path) : http().post(path);
    const res = await req.set("X-Branch-Id", A.branchId).set("X-Business-Id", A.businessId).send({});
    expect(res.status).toBe(401);
  });

  it("a revoked/unknown device token is refused too", async () => {
    await http().get("/api/orders").set("X-Device-Token", "f".repeat(64)).expect(401);
  });

  it("enrolled devices, sign-in, enrollment, health and the guest API still work", async () => {
    await http().get("/api/orders").set("X-Device-Token", A.deviceToken).expect(200);
    await http().get("/api/health").expect(200);
    const login = await http().post("/api/auth/login").send({ username: "nobody", password: "x" });
    expect(login.status).toBe(401); // reaches the handler: wrong credentials, not "set up this device"
    expect(login.body.message).toMatch(/Wrong username/);
    const enroll = await http().post("/api/devices/enroll").send({ code: "NOPE" });
    expect(enroll.status).toBe(400);
    await http().get(`/api/public/t/${A.tableToken}`).expect(200);
  });

  it("the order socket needs a device token, not just a branch id", async () => {
    const intruder = io(`${url}/orders`, { auth: { branchId: A.branchId }, transports: ["websocket"] });
    await new Promise((r) => intruder.once("disconnect", r));
    intruder.close();
    const pos = io(`${url}/orders`, { auth: { deviceToken: A.deviceToken }, transports: ["websocket"] });
    await new Promise<void>((resolve) => pos.once("connect", () => resolve()));
    expect(pos.connected).toBe(true);
    pos.close();
  });
});
