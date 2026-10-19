import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "mysql://test:test@127.0.0.1:3306/test";

const { default: adminUserRoutes } = await import(
  "../api/routes/user/admin/adminUserRoutes.js"
);

const app = express();
app.use("/api/user/admin", adminUserRoutes);

after(async () => {
  const { prisma } = await import("../api/prisma/client.js");
  await prisma.$disconnect();
});

describe("POST /api/user/admin/upload", () => {
  it("accepts a CSV file and confirms its buffer is ready", async () => {
    const csvBuffer = Buffer.from("name,email\nAda,ada@example.com\n");
    const response = await request(app)
      .post("/api/user/admin/upload")
      .attach("file", csvBuffer, {
        filename: "users.csv",
        contentType: "text/csv",
      });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, {
      filename: "users.csv",
      size: csvBuffer.length,
      mimetype: "text/csv",
      bufferReady: true,
    });
  });

  it("accepts standard CSV MIME types when the filename ends in .csv", async () => {
    const mimeTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "text/plain",
      "application/csv",
      "text/x-csv",
      "application/octet-stream",
    ];

    for (const contentType of mimeTypes) {
      const response = await request(app)
        .post("/api/user/admin/upload")
        .attach("file", Buffer.from("name,email\nAda,ada@example.com\n"), {
          filename: "users.csv",
          contentType,
        });

      assert.equal(response.status, 200, `${contentType} should be accepted`);
    }
  });

  it("returns 400 when no file is attached", async () => {
    const response = await request(app).post("/api/user/admin/upload");

    assert.equal(response.status, 400);
    assert.equal(response.body.errors, "No file uploaded");
  });

  it("rejects a file with a non-CSV extension and MIME type", async () => {
    const response = await request(app)
      .post("/api/user/admin/upload")
      .attach("file", Buffer.from("%PDF-1.7"), {
        filename: "document.pdf",
        contentType: "application/pdf",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.errors, "Only CSV files are allowed.");
  });

  it("rejects an .xls file reported as an Excel MIME type", async () => {
    const response = await request(app)
      .post("/api/user/admin/upload")
      .attach("file", Buffer.from("name,email\nAda,ada@example.com\n"), {
        filename: "users.xls",
        contentType: "application/vnd.ms-excel",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.errors, "Only CSV files are allowed.");
  });

  it("rejects an .exe file reported as CSV", async () => {
    const response = await request(app)
      .post("/api/user/admin/upload")
      .attach("file", Buffer.from("not a csv"), {
        filename: "evil.exe",
        contentType: "text/csv",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.errors, "Only CSV files are allowed.");
  });

  it("returns 413 when the file exceeds 5MB", async () => {
    const response = await request(app)
      .post("/api/user/admin/upload")
      .attach("file", Buffer.alloc(5 * 1024 * 1024 + 1, "a"), {
        filename: "large.csv",
        contentType: "text/csv",
      });

    assert.equal(response.status, 413);
    assert.equal(
      response.body.errors,
      "File size exceeds the 5MB limit."
    );
  });
});
