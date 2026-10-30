import { describe, expect, it } from "vitest";

import { decryptPayload, encryptPayload } from "../../src/export/envelope";

const PASSWORD = "a long enough backup passphrase";

describe("encrypted envelope", () => {
  it("gives back the payload it was made from", async () => {
    const payload = Buffer.from("balances: 12345 EUR, 6789 USD", "utf8");

    const file = await encryptPayload(payload, PASSWORD, "snapshot");
    const decrypted = await decryptPayload(file, PASSWORD, "snapshot");

    expect(decrypted.equals(payload)).toBe(true);
  });

  it("does not contain the payload in clear", async () => {
    const payload = Buffer.from("a very recognizable sentence about money", "utf8");

    const file = await encryptPayload(payload, PASSWORD, "snapshot");

    expect(file.includes(payload)).toBe(false);
  });

  it("produces a different file each time for the same input", async () => {
    const payload = Buffer.from("same input", "utf8");

    const first = await encryptPayload(payload, PASSWORD, "snapshot");
    const second = await encryptPayload(payload, PASSWORD, "snapshot");

    expect(first.equals(second)).toBe(false);
  });

  it("refuses a wrong password", async () => {
    const file = await encryptPayload(Buffer.from("secret"), PASSWORD, "snapshot");

    await expect(decryptPayload(file, "another long passphrase", "snapshot")).rejects.toMatchObject({
      name: "BackupError",
      code: "wrongPasswordOrCorrupt",
    });
  });

  it.each([
    ["salt", 20],
    ["nonce", 35],
    ["ciphertext", 46],
    ["authentication tag", -1],
  ])("refuses a file whose %s was altered", async (_part, position) => {
    const file = await encryptPayload(Buffer.from("secret payload"), PASSWORD, "snapshot");
    const index = position < 0 ? file.length + position : position;
    file[index] = (file[index] ?? 0) ^ 0xff;

    await expect(decryptPayload(file, PASSWORD, "snapshot")).rejects.toMatchObject({
      code: "wrongPasswordOrCorrupt",
    });
  });

  it("refuses a file that was truncated", async () => {
    const file = await encryptPayload(Buffer.from("secret payload"), PASSWORD, "snapshot");

    await expect(
      decryptPayload(file.subarray(0, file.length - 5), PASSWORD, "snapshot"),
    ).rejects.toMatchObject({ code: "wrongPasswordOrCorrupt" });
  });

  it("refuses a file that is not a backup", async () => {
    await expect(
      decryptPayload(Buffer.from("just some text that is long enough to have a header....."), PASSWORD, "snapshot"),
    ).rejects.toMatchObject({ code: "notABackup" });
    await expect(decryptPayload(Buffer.alloc(0), PASSWORD, "snapshot")).rejects.toMatchObject({
      code: "notABackup",
    });
  });

  it("refuses a format version it does not know", async () => {
    const file = await encryptPayload(Buffer.from("secret"), PASSWORD, "snapshot");
    file.writeUInt8(2, 8);

    await expect(decryptPayload(file, PASSWORD, "snapshot")).rejects.toMatchObject({
      code: "unsupportedFormat",
    });
  });

  it("refuses key derivation costs that would exhaust the server", async () => {
    const file = await encryptPayload(Buffer.from("secret"), PASSWORD, "snapshot");
    file.writeUInt32BE(0xffffffff, 10);

    await expect(decryptPayload(file, PASSWORD, "snapshot")).rejects.toMatchObject({
      code: "unsupportedFormat",
    });
  });

  it("refuses a file of another kind than the one expected", async () => {
    const file = await encryptPayload(Buffer.from("{}"), PASSWORD, "json-export");

    await expect(decryptPayload(file, PASSWORD, "snapshot")).rejects.toMatchObject({
      code: "wrongKind",
    });
  });

  it("refuses to encrypt with a password that is too short", async () => {
    await expect(encryptPayload(Buffer.from("secret"), "short", "snapshot")).rejects.toMatchObject({
      code: "passwordTooShort",
    });
  });
});
