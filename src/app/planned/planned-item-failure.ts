import { messageRef, type MessageRef, type Translate } from "../../domain/message";
import { PlannedItemValidationError, type PlannedItemField } from "../../domain/planned-item";
import { PlannedItemNotFoundError } from "../../ledger/planned-items";
import { flashError } from "../feedback/flash";

// Not a "use server" file: its exports would become endpoints callable from the browser.

export function describeFailure(error: unknown): MessageRef {
  if (error instanceof PlannedItemNotFoundError) return messageRef("plannedItemGone");
  // Unexpected failures are logged with their detail, the user sees a generic message.
  console.error("Planned item action failed", error);
  return messageRef("plannedItemNotSaved");
}

/**
 * A refusal of the domain is shown on its field, when the form has a control for it. A failure that
 * no field explains is told in a toast as well.
 */
export async function toFailureState<Field extends string>(
  error: unknown,
  translate: Translate,
  controlOf: (field: PlannedItemField) => Field | undefined,
): Promise<{ field?: Field; message: string }> {
  if (error instanceof PlannedItemValidationError) {
    const field = controlOf(error.field);
    return { ...(field === undefined ? {} : { field }), message: translate(error.ref) };
  }
  const ref = describeFailure(error);
  await flashError(ref);
  return { message: translate(ref) };
}
