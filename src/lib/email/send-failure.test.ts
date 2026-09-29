import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EmailSendError, resendErrorCode, sendFailureKind } from "./send-failure";

const refused = (status: number, code: string | null = null) =>
  new EmailSendError(status, code, `Resend responded ${status}`);

describe("sendFailureKind", () => {
  it("stops on refusals of the email that would only repeat", () => {
    assert.equal(sendFailureKind(refused(422, "invalid_parameter")), "permanent");
    assert.equal(sendFailureKind(refused(422, "missing_required_field")), "permanent");
    assert.equal(sendFailureKind(refused(400, "validation_error")), "permanent");
    assert.equal(sendFailureKind(refused(400)), "permanent");
    assert.equal(sendFailureKind(refused(409)), "permanent");
  });

  it("tries again later when Resend is down, slow or rate limiting", () => {
    assert.equal(sendFailureKind(refused(429, "rate_limit_exceeded")), "temporary");
    assert.equal(sendFailureKind(refused(429, "daily_quota_exceeded")), "temporary");
    assert.equal(sendFailureKind(refused(408)), "temporary");
    assert.equal(sendFailureKind(refused(409, "resource_locked")), "temporary");
    assert.equal(sendFailureKind(refused(500, "internal_server_error")), "temporary");
    assert.equal(sendFailureKind(refused(503)), "temporary");
  });

  it("tries again later when the Resend account is refused, not the email", () => {
    // A wrong or revoked key, or an unverified sender: every email fails until the set-up is fixed.
    assert.equal(sendFailureKind(refused(401, "missing_api_key")), "temporary");
    assert.equal(sendFailureKind(refused(401, "restricted_api_key")), "temporary");
    assert.equal(sendFailureKind(refused(403, "validation_error")), "temporary");
    assert.equal(sendFailureKind(refused(403, "suspended_api_key")), "temporary");
    assert.equal(sendFailureKind(refused(403)), "temporary");
  });

  it("recognises an earlier send under the same key that went through with other content", () => {
    assert.equal(sendFailureKind(refused(409, "invalid_idempotent_request")), "already_sent");
  });

  it("treats errors without an answer from Resend as temporary", () => {
    assert.equal(sendFailureKind(new Error("The operation was aborted due to timeout")), "temporary");
    assert.equal(sendFailureKind("not an error"), "temporary");
  });

  it("leaves a send already under way with the same key to decide", () => {
    assert.equal(sendFailureKind(refused(409, "concurrent_idempotent_requests")), "in_progress");
  });
});

describe("resendErrorCode", () => {
  it("reads Resend's error name", () => {
    assert.equal(
      resendErrorCode('{"statusCode":422,"name":"invalid_parameter","message":"Invalid `to` field."}'),
      "invalid_parameter",
    );
  });

  it("is null for anything else", () => {
    assert.equal(resendErrorCode(""), null);
    assert.equal(resendErrorCode("<html>Bad gateway</html>"), null);
    assert.equal(resendErrorCode('{"message":"no name"}'), null);
    assert.equal(resendErrorCode('{"name":42}'), null);
  });
});
