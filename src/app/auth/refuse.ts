import type { MessageRef } from "../../domain/message";
import { flashError } from "../feedback/flash";

/** Tells a refused submit in a toast and leaves the form as it is. */
export async function refuse(ref: MessageRef): Promise<null> {
  await flashError(ref);
  return null;
}
