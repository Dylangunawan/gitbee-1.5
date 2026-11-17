import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const toDataUrl = (jsCode) =>
  `data:text/javascript;base64,${Buffer.from(jsCode).toString("base64")}`;

// 1. Test the loginLocal action contract
const actionsSource = await readFile(
  new URL("../src/app/(pages)/login/actions.tsx", import.meta.url),
  "utf8"
);
const { outputText: actionsJs } = ts.transpileModule(actionsSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
});
const { loginLocal } = await import(toDataUrl(actionsJs));

test("loginLocal posts identifier and password with session credentials", async (t) => {
  const previous = process.env.NEXT_PUBLIC_BACKEND_API;
  process.env.NEXT_PUBLIC_BACKEND_API = "http://localhost:5001/api/";
  const calls = [];
  let response = Response.json({
    status: true,
    data: {
      nim: "2702000001",
      Name: "Student",
      Email: "student@binus.edu",
      ActiveRole: "Student",
      Role: ["Student"],
      MicrosoftToken: "",
    },
  });

  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, ...options });
    if (response instanceof Error) throw response;
    return response.clone();
  });

  try {
    const ok = await loginLocal("2702000001", "Password123!");
    assert.equal(ok.success, true);
    assert.equal(ok.data.nim, "2702000001");
    assert.equal(calls.at(-1).url, "http://localhost:5001/api/auth/login-local");
    assert.equal(calls.at(-1).method, "POST");
    assert.equal(calls.at(-1).credentials, "include");
    assert.deepEqual(JSON.parse(calls.at(-1).body), {
      identifier: "2702000001",
      password: "Password123!",
    });

    response = Response.json(
      { status: false, errors: "Invalid credentials" },
      { status: 401 }
    );
    assert.deepEqual(await loginLocal("2702000001", "wrong"), {
      success: false,
      message: "Invalid credentials",
    });

    response = new Response(null, { status: 404 });
    assert.equal((await loginLocal("2702000001", "Password123!")).success, false);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_BACKEND_API;
    else process.env.NEXT_PUBLIC_BACKEND_API = previous;
  }
});

// 2. Test LocalLoginForm Microsoft SSO fallback ([P2])
const routerMockUrl = toDataUrl(`
  export const state = { pushes: [], replaces: [] };
  export const useRouter = () => ({
    push: (url) => state.pushes.push(url),
    replace: (url) => state.replaces.push(url),
  });
`);

const msalMockUrl = toDataUrl(`
  export const state = { inProgress: "none", accounts: [], redirects: [] };
  export const useMsal = () => ({
    inProgress: state.inProgress,
    accounts: state.accounts,
    instance: {
      loginRedirect: async (req) => {
        state.redirects.push(req);
      },
    },
  });
`);

const actionsMockUrl = toDataUrl(`
  export const loginLocal = async () => ({ success: false, message: "Invalid credentials" });
`);

const authContextMockUrl = toDataUrl(`
  export const useAuth = () => ({ userData: null, setUserData: () => {} });
`);

const libAuthMockUrl = toDataUrl(`
  export let SSO_BYPASS_ENABLED = false;
  export const setBypassSso = (value) => { SSO_BYPASS_ENABLED = value; };
  export const dashboardPathForRole = () => "/dashboard";
`);

const jsxRuntimeSpyUrl = toDataUrl(`
  import { jsx as realJsx, jsxs as realJsxs, Fragment } from ${JSON.stringify(
    import.meta.resolve("react/jsx-runtime")
  )};
  export const elements = [];
  export function jsx(type, props, key) {
    elements.push({ type, props });
    return realJsx(type, props, key);
  }
  export function jsxs(type, props, key) {
    elements.push({ type, props });
    return realJsxs(type, props, key);
  }
  export { Fragment };
`);

const formSource = await readFile(
  new URL("../src/app/(pages)/login/LocalLoginForm.tsx", import.meta.url),
  "utf8"
);
const compiledForm = ts
  .transpileModule(formSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
  })
  .outputText.replaceAll('"react/jsx-runtime"', JSON.stringify(jsxRuntimeSpyUrl))
  .replaceAll('"react"', JSON.stringify(import.meta.resolve("react")))
  .replaceAll('"next/navigation"', JSON.stringify(routerMockUrl))
  .replaceAll('"@azure/msal-react"', JSON.stringify(msalMockUrl))
  .replaceAll('"./actions"', JSON.stringify(actionsMockUrl))
  .replaceAll('"@/app/context/AuthContext"', JSON.stringify(authContextMockUrl))
  .replaceAll('"@/lib/auth"', JSON.stringify(libAuthMockUrl));

const { default: LocalLoginForm } = await import(toDataUrl(compiledForm));
const routerMock = await import(routerMockUrl);
const msalMock = await import(msalMockUrl);
const libAuthMock = await import(libAuthMockUrl);
const jsxSpy = await import(jsxRuntimeSpyUrl);
const { jsx } = await import("react/jsx-runtime");

function renderAndFindSsoButton() {
  jsxSpy.elements.length = 0;
  renderToStaticMarkup(jsx(LocalLoginForm, {}));
  const button = jsxSpy.elements.find(
    (el) =>
      el.type === "button" &&
      el.props?.children === "Sign in with Microsoft SSO instead"
  );
  assert.ok(button, "Expected SSO fallback control to render as a <button>");
  return button;
}

test("Microsoft SSO fallback starts MSAL loginRedirect on a fresh session", async () => {
  routerMock.state.pushes.length = 0;
  msalMock.state.redirects.length = 0;
  msalMock.state.accounts = [];
  msalMock.state.inProgress = "none";
  libAuthMock.setBypassSso(false);

  const ssoButton = renderAndFindSsoButton();
  await ssoButton.props.onClick();

  assert.deepEqual(msalMock.state.redirects, [
    { scopes: ["user.read"], prompt: "select_account" },
  ]);
  assert.deepEqual(routerMock.state.pushes, []);
});

test("Microsoft SSO fallback routes to /login/microsoft when SSO bypass is enabled and ignores clicks while MSAL is busy", async () => {
  routerMock.state.pushes.length = 0;
  msalMock.state.redirects.length = 0;

  // Busy MSAL interaction should no-op
  msalMock.state.inProgress = "login";
  libAuthMock.setBypassSso(false);
  const busyButton = renderAndFindSsoButton();
  assert.equal(busyButton.props.disabled, true);
  await busyButton.props.onClick();
  assert.equal(msalMock.state.redirects.length, 0);
  assert.equal(routerMock.state.pushes.length, 0);

  // Dev SSO bypass routes to /login/microsoft
  msalMock.state.inProgress = "none";
  libAuthMock.setBypassSso(true);
  const bypassButton = renderAndFindSsoButton();
  await bypassButton.props.onClick();
  assert.deepEqual(routerMock.state.pushes, ["/login/microsoft"]);
  assert.equal(msalMock.state.redirects.length, 0);
});