import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/accountApi.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
});
const { getAccounts } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("student/staff requests carry the session, search, role and server pagination", async (t) => {
  const previous = process.env.NEXT_PUBLIC_BACKEND_API;
  process.env.NEXT_PUBLIC_BACKEND_API = "http://localhost:5001/api/";
  t.after(() => {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_BACKEND_API;
    else process.env.NEXT_PUBLIC_BACKEND_API = previous;
  });
  const data = {
    items: [{ id: 1, name: "Ana" }],
    total: 45,
    page: 2,
    pageSize: 20,
  };
  const controller = new AbortController();
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url: new URL(url), options });
    return Response.json({ status: true, data });
  });
  for (const type of ["student", "staff"]) {
    assert.deepEqual(
      await getAccounts(type, {
        search: " Ana & Co+ ",
        page: 2,
        roleFilter: "HoP",
        signal: controller.signal,
      }),
      data,
    );
    const call = calls.at(-1);
    assert.equal(call.url.pathname, `/api/user/admin/get-${type}-accounts`);
    assert.equal(call.url.searchParams.get("search"), "Ana & Co+");
    assert.equal(call.url.searchParams.get("page"), "2");
    assert.equal(call.url.searchParams.get("pageSize"), "20");
    assert.equal(
      call.url.searchParams.get("roleFilter"),
      type === "staff" ? "HoP" : null,
    );
    assert.equal(call.options.credentials, "include");
    assert.equal(call.options.cache, "no-store");
    assert.equal(call.options.signal, controller.signal);
  }
  await getAccounts("staff", { search: "  " });
  assert.equal(calls.at(-1).url.searchParams.get("page"), "1");
  assert.equal(calls.at(-1).url.searchParams.has("search"), false);
  assert.equal(calls.at(-1).url.searchParams.has("roleFilter"), false);
});

test("failed account fetches surface session, access, validation and server errors", async (t) => {
  let status = 401;
  let errors = "internal detail";
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ status: false, errors }, { status }),
  );
  await assert.rejects(() => getAccounts("student"), /session expired/);
  status = 403;
  await assert.rejects(() => getAccounts("staff"), /administrator account/);
  status = 400;
  errors = ["Invalid page", "Invalid role"];
  await assert.rejects(
    () => getAccounts("staff"),
    /Invalid page; Invalid role/,
  );
  status = 500;
  errors = "Fetch Failed";
  await assert.rejects(() => getAccounts("student"), /Fetch Failed/);
});
