import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { signInRedirectFor } from "./private-areas";

const request = (
  pathname: string,
  overrides: { method?: string; search?: string; cookieNames?: string[] } = {},
) => ({
  method: overrides.method ?? "GET",
  pathname,
  search: overrides.search ?? "",
  cookieNames: overrides.cookieNames ?? [],
});

describe("signInRedirectFor", () => {
  it("sends signed-out visitors from the account to sign in, coming back to the same page", () => {
    assert.equal(signInRedirectFor(request("/account")), "/account/sign-in?callbackUrl=%2Faccount");
    assert.equal(
      signInRedirectFor(request("/account/orders/ORD-2026-000004", { search: "?tab=items" })),
      "/account/sign-in?callbackUrl=%2Faccount%2Forders%2FORD-2026-000004%3Ftab%3Ditems",
    );
  });

  it("never redirects the sign-in pages themselves", () => {
    for (const path of ["/account/sign-in", "/account/sign-in/check-email", "/account/sign-in/confirm"]) {
      assert.equal(signInRedirectFor(request(path)), null, path);
    }
  });

  it("leaves everything outside private areas alone", () => {
    for (const path of ["/", "/accounts", "/wishlist", "/checkout", "/api/auth/session"]) {
      assert.equal(signInRedirectFor(request(path)), null, path);
    }
  });

  it("lets a request with a session cookie through (pages verify it)", () => {
    assert.equal(
      signInRedirectFor(request("/account", { cookieNames: ["__Secure-authjs.session-token"] })),
      null,
    );
    assert.equal(signInRedirectFor(request("/account", { cookieNames: ["authjs.session-token"] })), null);
    assert.equal(signInRedirectFor(request("/account", { cookieNames: ["authjs.session-token.0"] })), null);
    assert.notEqual(signInRedirectFor(request("/account", { cookieNames: ["authjs.csrf-token"] })), null);
  });

  it("leaves server actions and other non-page requests to answer for themselves", () => {
    assert.equal(signInRedirectFor(request("/account/profile", { method: "POST" })), null);
    assert.notEqual(signInRedirectFor(request("/account/profile", { method: "HEAD" })), null);
  });
});
