import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

for (const [folder, component] of [["data-demo", "DataDemo"], ["demo-login", "DemoLogin"]]) {
  test(`${folder} renders only when explicitly enabled`, async () => {
    const source = (await readFile(new URL(`../src/app/${folder}/page.tsx`, import.meta.url), "utf8"))
      .replace('"next/navigation"', JSON.stringify(import.meta.resolve("next/navigation.js")))
      .replace(`"./${component}"`, '"data:text/javascript,export default function Component() {}"');
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText
      .replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")));
    const { default: Page } = await import("data:text/javascript;base64," + Buffer.from(output).toString("base64"));
    const previous = process.env.NEXT_PUBLIC_DEMO;
    try {
      for (const flag of [undefined, "false"]) {
        if (flag === undefined) delete process.env.NEXT_PUBLIC_DEMO;
        else process.env.NEXT_PUBLIC_DEMO = flag;
        assert.throws(Page, error => error.digest === "NEXT_HTTP_ERROR_FALLBACK;404");
      }
      process.env.NEXT_PUBLIC_DEMO = "true";
      assert.equal(typeof Page().type, "function");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_DEMO;
      else process.env.NEXT_PUBLIC_DEMO = previous;
    }
  });
}
