import en from "../../../messages/en.json";
import { messageRef, type FeedbackKey, type MessageRef } from "../../domain/message";

export const FLASH_COOKIE = "demain_flash";

export type FlashKind = "success" | "error";

/**
 * A notice that outlives the request that raised it: a server action records
 * it in a cookie and the next render of the layout shows it as a toast. It
 * holds a message reference, never text, so that it is translated in the
 * language of the render and carries no data of the user.
 */
export interface Flash {
  /** Tells two notices apart, so that a re-render does not show the same one twice. */
  id: string;
  kind: FlashKind;
  ref: MessageRef;
}

const FEEDBACK_KEYS: readonly string[] = Object.keys(en.feedback);

export function encodeFlash(flash: Flash): string {
  return JSON.stringify(flash);
}

function isFlashKind(kind: unknown): kind is FlashKind {
  return kind === "success" || kind === "error";
}

function isFeedbackKey(key: unknown): key is FeedbackKey {
  return typeof key === "string" && FEEDBACK_KEYS.includes(key);
}

function isMessageValues(values: unknown): values is NonNullable<MessageRef["values"]> {
  return (
    typeof values === "object" &&
    values !== null &&
    Object.values(values).every((value) => typeof value === "string" || typeof value === "number")
  );
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

/**
 * The notice a cookie holds. The cookie comes from the browser, so anything
 * that is not exactly what `encodeFlash` writes is ignored.
 */
export function decodeFlash(raw: string | undefined): Flash | null {
  if (raw === undefined) return null;
  const parsed = parseJson(raw);
  if (typeof parsed !== "object" || parsed === null) return null;

  const { id, kind, ref } = parsed as Record<string, unknown>;
  if (typeof id !== "string" || id === "") return null;
  if (!isFlashKind(kind)) return null;
  if (typeof ref !== "object" || ref === null) return null;

  const { key, values } = ref as Record<string, unknown>;
  if (!isFeedbackKey(key)) return null;
  if (values !== undefined && !isMessageValues(values)) return null;
  return { id, kind, ref: messageRef(key, values) };
}
