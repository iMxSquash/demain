import { argon2Sync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../../src/auth/password";

describe("password hashing", () => {
  it("accepts the password that was hashed", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a different password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(await verifyPassword("Correct horse battery staple", hash)).toBe(false);
  });

  it("produces a different hash each time for the same password", async () => {
    const first = await hashPassword("same password");
    const second = await hashPassword("same password");

    expect(first).not.toBe(second);
  });

  it("does not contain the password in the stored hash", async () => {
    const hash = await hashPassword("very-distinctive-secret");

    expect(hash).not.toContain("very-distinctive-secret");
  });

  it("rejects a malformed hash instead of throwing", async () => {
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "$argon2id$v=19$m=1,t=1,p=1$$")).toBe(false);
  });

  it("verifies a hash made with other cost parameters", async () => {
    // Built independently of the module: raising the cost later must not lock
    // the owner out of an older hash.
    const salt = Buffer.from("some-16-byte-salt");
    const tag = argon2Sync("argon2id", {
      message: "legacy password",
      nonce: salt,
      parallelism: 1,
      tagLength: 32,
      memory: 64,
      passes: 2,
    });
    const unpadded = (bytes: Buffer) => bytes.toString("base64").replace(/=+$/, "");
    const legacy = `$argon2id$v=19$m=64,t=2,p=1$${unpadded(salt)}$${unpadded(tag)}`;

    expect(await verifyPassword("legacy password", legacy)).toBe(true);
    expect(await verifyPassword("other password", legacy)).toBe(false);
  });
});
