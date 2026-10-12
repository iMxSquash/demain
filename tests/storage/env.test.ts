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
});
