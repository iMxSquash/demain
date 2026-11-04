import { describe, expect, it } from "vitest";

import { isOwnCloseEvent } from "../../../src/app/imports/review-dialog-close";

describe("isOwnCloseEvent", () => {
  it("accepts the close of the dialog itself", () => {
    const review = {};

    expect(isOwnCloseEvent({ target: review, currentTarget: review })).toBe(true);
  });

  it("ignores the close of a dialog nested in the review", () => {
    const review = {};
    const confirmation = {};

    expect(isOwnCloseEvent({ target: confirmation, currentTarget: review })).toBe(false);
  });
});
