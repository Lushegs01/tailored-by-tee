import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isVerifiedGoogleProfile, publicSession, signInEmailLimitKey } from "./callbacks";

describe("publicSession", () => {
  const expires = new Date("2026-10-15T12:00:00.000Z");
  const stored = { sessionToken: "SECRET-SESSION-TOKEN", userId: "u1", expires };
  const user = {
    id: "u1",
    name: "Adaeze Okafor",
    email: "adaeze@example.com",
    emailVerified: new Date("2026-01-01T00:00:00.000Z"),
    image: null,
    role: "CUSTOMER" as const,
  };

  it("never passes the session token or internal ids to the browser", () => {
    const result = publicSession(stored, user);
    assert.equal("sessionToken" in result, false);
    assert.equal("userId" in result, false);
    assert.equal("emailVerified" in result.user, false);
    assert.equal(JSON.stringify(result).includes("SECRET-SESSION-TOKEN"), false);
  });

  it("keeps what the client and the admin area need", () => {
    assert.deepEqual(publicSession(stored, user), {
      expires: "2026-10-15T12:00:00.000Z",
      user: { id: "u1", name: "Adaeze Okafor", email: "adaeze@example.com", image: null, role: "CUSTOMER" },
    });
  });

  it("defaults a missing role to customer and missing names to null", () => {
    const result = publicSession({ expires: "2026-10-15T12:00:00.000Z" }, { id: "u2", email: "b@example.com" });
    assert.deepEqual(result.user, { id: "u2", name: null, email: "b@example.com", image: null, role: "CUSTOMER" });
  });
});

describe("isVerifiedGoogleProfile", () => {
  it("accepts only an explicitly verified address", () => {
    assert.equal(isVerifiedGoogleProfile({ email_verified: true }), true);
    assert.equal(isVerifiedGoogleProfile({ email_verified: false }), false);
    assert.equal(isVerifiedGoogleProfile({}), false);
    assert.equal(isVerifiedGoogleProfile({ email_verified: "true" }), false);
    assert.equal(isVerifiedGoogleProfile(null), false);
    assert.equal(isVerifiedGoogleProfile(undefined), false);
  });
});

describe("signInEmailLimitKey", () => {
  it("counts plus-addressed variants against the same address", () => {
    assert.equal(signInEmailLimitKey("Victim+1@Example.com"), "victim@example.com");
    assert.equal(signInEmailLimitKey("victim+anything+else@example.com"), "victim@example.com");
    assert.equal(signInEmailLimitKey(" victim@example.com "), "victim@example.com");
  });

  it("leaves unusual addresses usable as keys", () => {
    assert.equal(signInEmailLimitKey("+tag@example.com"), "+tag@example.com");
    assert.equal(signInEmailLimitKey("not-an-email"), "not-an-email");
  });
});
