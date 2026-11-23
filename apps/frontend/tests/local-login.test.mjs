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
const actionsDataUrl = toDataUrl(actionsJs);
const { loginLocal } = await import(actionsDataUrl);

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

// 2. Test LocalLoginForm MSAL initialization boundary, redirect handling, and session replacement
const routerMockUrl = toDataUrl(`
  export const state = { pushes: [], replaces: [] };
  export const useRouter = () => ({
    push: (url) => state.pushes.push(url),
    replace: (url) => state.replaces.push(url),
  });
`);

const msalMockUrl = toDataUrl(`
  export const state = {
    initialized: true,
    inProgress: "none",
    accounts: [],
    activeAccount: null,
    redirects: [],
    redirectPromiseResult: null,
    handleRedirectCalls: 0,
    silentCalls: [],
  };
  export const useMsal = () => ({
    inProgress: state.inProgress,
    accounts: state.accounts,
    instance: {
      loginRedirect: async (req) => {
        state.redirects.push(req);
      },
      handleRedirectPromise: async () => {
        state.handleRedirectCalls += 1;
        if (!state.initialized || state.inProgress === "startup") {
          throw new Error("uninitialized_public_client_application");
        }
        return state.redirectPromiseResult;
      },
      setActiveAccount: (account) => {
        state.activeAccount = account;
      },
      acquireTokenSilent: async (req) => {
        state.silentCalls.push(req);
        return { idToken: req.account?.idToken ?? "" };
      },
    },
  });
`);

const authContextMockUrl = toDataUrl(`
  export const state = { userData: null, updates: [] };
  export const useAuth = () => ({
    userData: state.userData,
    setUserData: (next) => {
      state.userData = next;
      state.updates.push(next);
    },
  });
`);

const libAuthMockUrl = toDataUrl(`
  export let SSO_BYPASS_ENABLED = false;
  export const setBypassSso = (value) => { SSO_BYPASS_ENABLED = value; };
  export const dashboardPathForRole = (role) =>
    role === "Admin" ? "/dashboard-admin" : "/dashboard";
`);

const reactSpyUrl = toDataUrl(`
  import React from ${JSON.stringify(import.meta.resolve("react"))};
  export const pendingEffects = [];
  let hookSlots = [];
  let hookCursor = 0;

  export function resetHooks() {
    hookSlots = [];
    hookCursor = 0;
    pendingEffects.length = 0;
  }

  export function beginRender() {
    hookCursor = 0;
    pendingEffects.length = 0;
  }

  export function useState(initial) {
    const idx = hookCursor++;
    if (!(idx in hookSlots)) {
      hookSlots[idx] = typeof initial === "function" ? initial() : initial;
    }
    const setState = (updater) => {
      hookSlots[idx] =
        typeof updater === "function" ? updater(hookSlots[idx]) : updater;
    };
    return [hookSlots[idx], setState];
  }

  export function useRef(initial) {
    const idx = hookCursor++;
    if (!(idx in hookSlots)) {
      hookSlots[idx] = { current: initial };
    }
    return hookSlots[idx];
  }

  export function useEffect(effect, deps) {
    const idx = hookCursor++;
    const prevDeps = hookSlots[idx];
    const changed =
      !prevDeps ||
      !deps ||
      deps.length !== prevDeps.length ||
      deps.some((dep, i) => !Object.is(dep, prevDeps[i]));
    if (changed) {
      hookSlots[idx] = deps;
      pendingEffects.push(effect);
    }
  }

  export async function flushEffects() {
    while (pendingEffects.length > 0) {
      const effect = pendingEffects.shift();
      await effect();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  export default { ...React, useState, useRef, useEffect };
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
  .replaceAll('"react"', JSON.stringify(reactSpyUrl))
  .replaceAll('"next/navigation"', JSON.stringify(routerMockUrl))
  .replaceAll('"@azure/msal-react"', JSON.stringify(msalMockUrl))
  .replaceAll('"./actions"', JSON.stringify(actionsDataUrl))
  .replaceAll('"@/app/context/AuthContext"', JSON.stringify(authContextMockUrl))
  .replaceAll('"@/lib/auth"', JSON.stringify(libAuthMockUrl));

const { default: LocalLoginForm } = await import(toDataUrl(compiledForm));
const routerMock = await import(routerMockUrl);
const msalMock = await import(msalMockUrl);
const authMock = await import(authContextMockUrl);
const libAuthMock = await import(libAuthMockUrl);
const reactSpy = await import(reactSpyUrl);
const jsxSpy = await import(jsxRuntimeSpyUrl);
const { jsx } = await import("react/jsx-runtime");

function rerenderForm() {
  jsxSpy.elements.length = 0;
  reactSpy.beginRender();
  return renderToStaticMarkup(jsx(LocalLoginForm, {}));
}

function mountForm() {
  reactSpy.resetHooks();
  return rerenderForm();
}

function findSsoButton() {
  const button = jsxSpy.elements.find(
    (el) =>
      el.type === "button" &&
      el.props?.children === "Sign in with Microsoft SSO instead"
  );
  assert.ok(button, "Expected SSO fallback control to render as a <button>");
  return button;
}

test("plain /login visit with cached MSAL accounts keeps the credential form and does not auto-sign-in", async (t) => {
  routerMock.state.pushes.length = 0;
  routerMock.state.replaces.length = 0;
  msalMock.state.redirects.length = 0;
  msalMock.state.silentCalls.length = 0;
  msalMock.state.handleRedirectCalls = 0;
  msalMock.state.redirectPromiseResult = null;
  msalMock.state.accounts = [
    { username: "a@binus.edu", idToken: "token-a" },
    { username: "b@binus.edu", idToken: "token-b" },
  ];
  msalMock.state.initialized = true;
  msalMock.state.inProgress = "none";
  authMock.state.userData = null;
  authMock.state.updates.length = 0;
  libAuthMock.setBypassSso(false);

  const backendCalls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    backendCalls.push(url);
    return Response.json({ status: true });
  });

  const html = mountForm();
  assert.match(html, /NIM \/ Email \/ Lecturer Code/);
  await reactSpy.flushEffects();

  assert.equal(msalMock.state.handleRedirectCalls, 1);
  assert.equal(backendCalls.length, 0);
  assert.equal(msalMock.state.silentCalls.length, 0);
  assert.equal(authMock.state.updates.length, 0);
  assert.equal(routerMock.state.replaces.length, 0);

  const ssoButton = findSsoButton();
  await ssoButton.props.onClick();
  assert.deepEqual(msalMock.state.redirects, [
    { scopes: ["user.read"], prompt: "select_account" },
  ]);
});

test("Microsoft SSO fallback routes to /login/microsoft when SSO bypass is enabled and ignores clicks while MSAL is busy", async () => {
  routerMock.state.pushes.length = 0;
  msalMock.state.redirects.length = 0;
  msalMock.state.accounts = [];
  msalMock.state.redirectPromiseResult = null;
  authMock.state.userData = null;

  msalMock.state.initialized = true;
  msalMock.state.inProgress = "login";
  libAuthMock.setBypassSso(false);
  mountForm();
  const busyButton = findSsoButton();
  assert.equal(busyButton.props.disabled, true);
  await busyButton.props.onClick();
  assert.equal(msalMock.state.redirects.length, 0);
  assert.equal(routerMock.state.pushes.length, 0);

  msalMock.state.inProgress = "none";
  libAuthMock.setBypassSso(true);
  mountForm();
  const bypassButton = findSsoButton();
  await bypassButton.props.onClick();
  assert.deepEqual(routerMock.state.pushes, ["/login/microsoft"]);
  assert.equal(msalMock.state.redirects.length, 0);
});

test("waits for MSAL startup to reach none before consuming redirect callback and exchanges selected account once", async (t) => {
  const previous = process.env.NEXT_PUBLIC_BACKEND_API;
  process.env.NEXT_PUBLIC_BACKEND_API = "http://localhost:5001/api/";

  routerMock.state.pushes.length = 0;
  routerMock.state.replaces.length = 0;
  msalMock.state.silentCalls.length = 0;
  msalMock.state.handleRedirectCalls = 0;
  msalMock.state.activeAccount = null;
  authMock.state.updates.length = 0;
  authMock.state.userData = {
    nim: "2702000001",
    name: "USER A",
    email: "a@binus.edu",
    role: "Student",
    listRole: ["Student"],
    microsoftToken: "",
  };
  libAuthMock.setBypassSso(false);

  const accountA = { username: "a@binus.edu", idToken: "token-a" };
  const accountB = { username: "b@binus.edu", idToken: "token-b" };
  msalMock.state.accounts = [accountA, accountB];
  msalMock.state.redirectPromiseResult = {
    account: accountB,
    idToken: "token-b",
  };

  // Start uninitialized in "startup" state (matching fresh page load before MsalProvider effect runs)
  msalMock.state.initialized = false;
  msalMock.state.inProgress = "startup";

  const backendCalls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    backendCalls.push({ url, ...options });
    return Response.json({
      status: true,
      data: {
        nim: "D5002",
        Name: "ADMIN B",
        Email: "b@binus.edu",
        ActiveRole: "Admin",
        Role: ["Admin", "Lecturer"],
        MicrosoftToken: "ms-session-b",
      },
    });
  });

  try {
    // 1. Initial mount during "startup": must NOT call handleRedirectPromise yet
    mountForm();
    await reactSpy.flushEffects();
    assert.equal(msalMock.state.handleRedirectCalls, 0);
    assert.equal(backendCalls.length, 0);

    // 2. MSAL finishes initialization and transitions inProgress to "none" on the same component instance
    msalMock.state.initialized = true;
    msalMock.state.inProgress = "none";
    const loadingHtml = rerenderForm();
    assert.match(loadingHtml, /NIM \/ Email \/ Lecturer Code/);
    await reactSpy.flushEffects();

    assert.equal(msalMock.state.handleRedirectCalls, 1);
    assert.equal(msalMock.state.activeAccount, accountB);
    assert.equal(backendCalls.length, 1);
    assert.equal(backendCalls[0].url, "http://localhost:5001/api/auth/login");
    assert.deepEqual(JSON.parse(backendCalls[0].body), {
      microsoft_token: "token-b",
    });

    assert.equal(authMock.state.updates.length, 1);
    assert.deepEqual(authMock.state.userData, {
      nim: "D5002",
      name: "ADMIN B",
      email: "b@binus.edu",
      role: "Admin",
      listRole: ["Admin", "Lecturer"],
      microsoftToken: "ms-session-b",
    });
    assert.deepEqual(routerMock.state.replaces, ["/dashboard-admin"]);

    // 3. Subsequent re-renders after readiness must not exchange the callback a second time
    const completingHtml = rerenderForm();
    assert.match(completingHtml, /Completing Microsoft sign-in/);
    await reactSpy.flushEffects();
    assert.equal(msalMock.state.handleRedirectCalls, 1);
    assert.equal(backendCalls.length, 1);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_BACKEND_API;
    else process.env.NEXT_PUBLIC_BACKEND_API = previous;
  }
});

test("next.config.mjs configures a 307 redirect from /login to /login/microsoft in production", async () => {
  const { default: nextConfig } = await import("../next.config.mjs");
  const prevNodeEnv = process.env.NODE_ENV;
  const prevLocalLogin = process.env.NEXT_PUBLIC_ENABLE_LOCAL_LOGIN;

  try {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PUBLIC_ENABLE_LOCAL_LOGIN;
    assert.deepEqual(await nextConfig.redirects(), [
      { source: "/login", destination: "/login/microsoft", permanent: false },
    ]);

    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_ENABLE_LOCAL_LOGIN = "false";
    assert.deepEqual(await nextConfig.redirects(), [
      { source: "/login", destination: "/login/microsoft", permanent: false },
    ]);

    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_ENABLE_LOCAL_LOGIN = "true";
    assert.deepEqual(await nextConfig.redirects(), []);
  } finally {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevLocalLogin === undefined) delete process.env.NEXT_PUBLIC_ENABLE_LOCAL_LOGIN;
    else process.env.NEXT_PUBLIC_ENABLE_LOCAL_LOGIN = prevLocalLogin;
  }
});