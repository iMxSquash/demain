import { describe, expect, it } from "vitest";

import { EnvError, parseEnv } from "../../src/storage/env";

describe("parseEnv", () => {
  it("returns the data directory when it is provided", () => {
    const env = parseEnv({ DEMAIN_DATA_DIR: "/data" });

    expect(env.DEMAIN_DATA_DIR).toBe("/data");
  });

  it("rejects a missing data directory with a message naming the variable", () => {
    const parse = () => parseEnv({});

    expect(parse).toThrow(EnvError);
    expect(parse).toThrow(/DEMAIN_DATA_DIR/);
  });

  it("rejects an empty or blank data directory", () => {
    expect(() => parseEnv({ DEMAIN_DATA_DIR: "" })).toThrow(EnvError);
    expect(() => parseEnv({ DEMAIN_DATA_DIR: "   " })).toThrow(EnvError);
  });

  it("ignores variables it does not know", () => {
    const env = parseEnv({ DEMAIN_DATA_DIR: "/data", PATH: "/usr/bin" });

    expect(env).toEqual({ DEMAIN_DATA_DIR: "/data" });
  });

  describe("setup token", () => {
    const LONG_TOKEN = "t".repeat(32);

    it("is optional, an instance already set up does not need it", () => {
      expect(parseEnv({ DEMAIN_DATA_DIR: "/data" }).DEMAIN_SETUP_TOKEN).toBeUndefined();
    });

    it("is returned when it is long enough to resist guessing", () => {
      const env = parseEnv({ DEMAIN_DATA_DIR: "/data", DEMAIN_SETUP_TOKEN: LONG_TOKEN });

      expect(env.DEMAIN_SETUP_TOKEN).toBe(LONG_TOKEN);
    });

    it("rejects a token shorter than 32 characters, naming the variable", () => {
      const parse = () => parseEnv({ DEMAIN_DATA_DIR: "/data", DEMAIN_SETUP_TOKEN: "short" });

      expect(parse).toThrow(EnvError);
      expect(parse).toThrow(/DEMAIN_SETUP_TOKEN/);
    });

    it("treats an empty value as not set, as compose files often leave it blank", () => {
      const env = parseEnv({ DEMAIN_DATA_DIR: "/data", DEMAIN_SETUP_TOKEN: "" });

      expect(env.DEMAIN_SETUP_TOKEN).toBeUndefined();
    });
  });
});
