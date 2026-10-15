import type en from "../../messages/en.json";

/** Key of a user-facing error or notice, checked against the reference translation file. */
export type FeedbackKey = keyof (typeof en)["feedback"];

/**
 * A user-facing message that is not yet in a language: the key of the
 * translation files and the values to insert. The domain raises these so that
 * it stays free of any locale, and the application translates them.
 */
export interface MessageRef {
  key: FeedbackKey;
  values?: Record<string, string | number>;
}

export function messageRef(
  key: FeedbackKey,
  values?: MessageRef["values"],
): MessageRef {
  return values === undefined ? { key } : { key, values };
}

/** Turns a message reference into text in the language of the current request. */
export type Translate = (ref: MessageRef) => string;
