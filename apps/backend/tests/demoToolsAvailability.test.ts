import assert from "node:assert/strict";
import { after, it } from "node:test";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "mysql://test:test@127.0.0.1:3306/test";
process.env.JWT_SECRET = "demo-availability-test-secret";
const { prisma } = await import("../api/prisma/client.js");
after(() => prisma.$disconnect());

it("mounts demo endpoints only with an explicit DEMO_TOOLS=true", async () => {
  const previous = process.env.DEMO_TOOLS;
  try {
    for (const flag of [undefined, "false", "true"]) {
      if (flag === undefined) delete process.env.DEMO_TOOLS;
      else process.env.DEMO_TOOLS = flag;
      const { default: routes } = await import(`../api/routes/user/userRoutes.js?demo=${flag}`);
      const app = express();
      app.use("/api/user", routes);
      for (const [method, path] of [
        ["get", "database"], ["get", "samples/student/xlsx"],
        ["post", "imports/preview"], ["post", "imports/save"],
      ] as const) {
        const response = await request(app)[method]("/api/user/admin/data-tools/" + path);
        assert.equal(response.status, flag === "true" ? 401 : 404, `${flag}: ${path}`);
      }
      assert.equal((await request(app).get("/api/user/admin/get-student-accounts")).status, 401);
    }
  } finally {
    if (previous === undefined) delete process.env.DEMO_TOOLS;
    else process.env.DEMO_TOOLS = previous;
  }
});
