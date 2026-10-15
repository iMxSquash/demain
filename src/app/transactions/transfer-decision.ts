/**
 * Values of the `decision` button of the transfer form. A separate module so
 * that the client form can import them without pulling the form parsers.
 */
export const TRANSFER_DECISION = {
  roomOnly: "room-only",
  sendSurplus: "send-surplus",
  cancel: "cancel",
} as const;
