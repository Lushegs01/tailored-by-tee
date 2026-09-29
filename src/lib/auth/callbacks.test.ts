import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isClosedAuthPost,
  isVerifiedGoogleProfile,
  publicSession,
  signInEmailLimitKey,
  signInNetworkLimitKey,
} from "./callbacks";

describe("isClosedAuthPost", () => {
  it("closes starting a sign-in over HTTP, for every provider", () => {
    assert.equal(isClosedAuthPost("/api/auth/signin/resend"), true);
    assert.equal(isClosedAuthPost("/api/auth/signin/google"), true);
    assert.equal(isClosedAuthPost("/api/auth/signin"), true);
    assert.equal(isClosedAuthPost("/api/auth/signin/resend/"), true);
  });

  it("leaves callbacks, sign-out and the session endpoint open", () => {
    assert.equal(isClosedAuthPost("/api/auth/callback/resend"), false);
    assert.equal(isClosedAuthPost("/api/auth/callback/google"), false);
    assert.equal(isClosedAuthPost("/api/auth/signout"), false);
    assert.equal(isClosedAuthPost("/api/auth/session"), false);
    assert.equal(isClosedAuthPost("/api/auth/signinfo"), false);
  });
});

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

describe("signInNetworkLimitKey", () => {
  it("counts an IPv4 address on its own", () => {
    assert.equal(signInNetworkLimitKey("102.89.34.7"), "102.89.34.7");
    assert.equal(signInNetworkLimitKey(" 102.89.34.7 "), "102.89.34.7");
    assert.notEqual(signInNetworkLimitKey("102.89.34.8"), "102.89.34.7");
  });

  it("counts IPv4-mapped IPv6 as the IPv4 address, however it is written", () => {
    const key = "102.89.34.7";
    assert.equal(signInNetworkLimitKey("::ffff:102.89.34.7"), key);
    assert.equal(signInNetworkLimitKey("::FFFF:102.89.34.7"), key);
    assert.equal(signInNetworkLimitKey("0:0:0:0:0:ffff:102.89.34.7"), key);
    assert.equal(signInNetworkLimitKey("0000:0000:0000:0000:0000:ffff:102.89.34.7"), key);
    assert.equal(signInNetworkLimitKey("::0:ffff:102.89.34.7"), key);
    assert.equal(signInNetworkLimitKey("::ffff:6659:2207"), key);
    assert.equal(signInNetworkLimitKey("0:0:0:0:0:ffff:6659:2207"), key);
    assert.equal(signInNetworkLimitKey("::ffff:6659:2207%eth0"), key);
    assert.equal(signInNetworkLimitKey("::ffff:0102:0304"), "1.2.3.4");
    // Different shoppers keep different allowances.
    assert.equal(signInNetworkLimitKey("0:0:0:0:0:ffff:1.2.3.5"), "1.2.3.5");
  });

  it("counts every address in one IPv6 /64 together, however it is written", () => {
    const key = "2001:db8:85a3:12::/64";
    assert.equal(signInNetworkLimitKey("2001:db8:85a3:12:1:2:3:4"), key);
    assert.equal(signInNetworkLimitKey("2001:0DB8:85a3:0012:ffff:ffff:ffff:ffff"), key);
    assert.equal(signInNetworkLimitKey("2001:db8:85a3:12::9"), key);
    assert.equal(signInNetworkLimitKey("2001:db8:85a3:12::1.2.3.4"), key);
    assert.equal(signInNetworkLimitKey("2001:db8:85a3:12:0:ffff:1.2.3.4"), key);
    assert.equal(signInNetworkLimitKey("2001:db8::1"), "2001:db8:0:0::/64");
    assert.equal(signInNetworkLimitKey("2001:db8:0:0:1::"), "2001:db8:0:0::/64");
    assert.equal(signInNetworkLimitKey("fe80::1%eth0"), "fe80:0:0:0::/64");
    assert.notEqual(signInNetworkLimitKey("2001:db8:85a3:13::1"), key);
  });

  it("never lets the all-zero /64 become one shared allowance", () => {
    assert.equal(signInNetworkLimitKey("::1"), "::1");
    assert.equal(signInNetworkLimitKey("0:0:0:0:0:0:0:1"), "::1");
    assert.equal(signInNetworkLimitKey("::"), "::");
    assert.equal(signInNetworkLimitKey("::1.2.3.4"), "::102:304");
    assert.notEqual(signInNetworkLimitKey("::2"), signInNetworkLimitKey("::1"));
    for (const address of ["::1", "::", "::ffff:1.2.3.4", "0:0:0:0:0:ffff:0102:0304", "::1.2.3.4"]) {
      assert.equal(signInNetworkLimitKey(address).endsWith("/64"), false, address);
    }
  });

  it("leaves anything else usable as a key", () => {
    assert.equal(signInNetworkLimitKey("local"), "local");
    assert.equal(signInNetworkLimitKey(""), "");
    assert.equal(signInNetworkLimitKey("1::2::3"), "1::2::3");
    assert.equal(signInNetworkLimitKey("2001:db8:1"), "2001:db8:1");
    assert.equal(signInNetworkLimitKey("not:an:address"), "not:an:address");
    assert.equal(signInNetworkLimitKey(":"), ":");
    assert.equal(signInNetworkLimitKey(":::"), ":::");
    assert.equal(signInNetworkLimitKey("1:2:3:4:5:6:7:8:9"), "1:2:3:4:5:6:7:8:9");
    assert.equal(signInNetworkLimitKey("1:2:3:4::5:6:7:8"), "1:2:3:4::5:6:7:8");
    assert.equal(signInNetworkLimitKey("12345::1"), "12345::1");
    assert.equal(signInNetworkLimitKey("::ffff:1.2.3.256"), "::ffff:1.2.3.256");
    assert.equal(signInNetworkLimitKey("::ffff:1.2.3"), "::ffff:1.2.3");
    assert.equal(signInNetworkLimitKey("1.2.3.4::"), "1.2.3.4::");
    assert.equal(signInNetworkLimitKey("::1.2.3.4:5"), "::1.2.3.4:5");
    assert.equal(signInNetworkLimitKey("[::1]:443"), "[::1]:443");
  });
});
