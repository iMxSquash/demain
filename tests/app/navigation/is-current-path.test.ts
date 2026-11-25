import { describe, expect, it } from "vitest";

import { isCurrentPath } from "../../../src/app/navigation/is-current-path";

describe("isCurrentPath", () => {
  it("marks the overview only on the root path", () => {
    expect(isCurrentPath("/", "/")).toBe(true);
    expect(isCurrentPath("/accounts", "/")).toBe(false);
  });

  it("marks a section on its own path and on the pages under it", () => {
    expect(isCurrentPath("/accounts", "/accounts")).toBe(true);
    expect(isCurrentPath("/accounts/3/edit", "/accounts")).toBe(true);
  });

  it("does not mark a section whose name only starts the path", () => {
    expect(isCurrentPath("/accountsx", "/accounts")).toBe(false);
  });

  it("does not mark a section on another one", () => {
    expect(isCurrentPath("/settings", "/transactions")).toBe(false);
  });
});

describe("isCurrentPath, pages that belong to another entry", () => {
  it("marks To pay and not Planned on the To pay page", () => {
    expect(isCurrentPath("/planned/due", "/planned/due")).toBe(true);
    expect(isCurrentPath("/planned/due", "/planned")).toBe(false);
  });

  it("marks Calendar and not Planned on the Link a transaction page", () => {
    expect(isCurrentPath("/planned/link", "/calendar")).toBe(true);
    expect(isCurrentPath("/planned/link", "/planned")).toBe(false);
  });
});
