"use server";

import { revalidatePath } from "next/cache";

import { messageRef, type FeedbackKey, type MessageRef } from "../../domain/message";
import { AccountNotFoundError } from "../../ledger/accounts";
import { CategoryNotFoundError } from "../../ledger/categories";
import {
  createRule,
  deleteRule,
  moveRule,
  RuleNotFoundError,
} from "../../ledger/categorization-rules";
import type { AppDatabase } from "../../storage/database";
import { withDatabase } from "../../storage/with-database";
import { requireSession } from "../auth/session";
import { flashError, flashSuccess, runWithNotice } from "../feedback/flash";
import { getTranslator } from "../translator";
import {
  parseRuleInput,
  readRuleFormValues,
  type RuleFormState,
} from "./rule-form-data";

const RULES_PATH = "/rules";

export async function createRuleAction(
  _previous: RuleFormState | null,
  formData: FormData,
): Promise<RuleFormState | null> {
  await requireSession();
  const translate = await getTranslator();
  const values = readRuleFormValues(formData);
  const parsed = parseRuleInput(formData, translate);
  if (!parsed.ok) {
    return { field: parsed.field, message: parsed.message, values };
  }

  try {
    withDatabase((db) => createRule(db, parsed.input));
  } catch (error) {
    if (error instanceof CategoryNotFoundError) {
      return {
        field: "categoryId",
        message: translate(messageRef("categoryGone")),
        values,
      };
    }
    if (error instanceof AccountNotFoundError) {
      return {
        field: "accountId",
        message: translate(messageRef("ruleAccountUnknown")),
        values,
      };
    }
    // Unexpected failures are logged with their detail, the user sees a generic message.
    console.error("Rule action failed", error);
    const ref = messageRef("nothingSaved");
    await flashError(ref);
    return { message: translate(ref), values };
  }

  revalidatePath(RULES_PATH);
  await flashSuccess("ruleCreated");
  return null;
}

function describeChangeFailure(error: unknown): MessageRef {
  // Already gone since the page was loaded: the refreshed page shows it.
  if (error instanceof RuleNotFoundError) return messageRef("ruleGone");
  console.error("Rule change failed", error);
  return messageRef("ruleNotChanged");
}

async function changeRules(
  change: (db: AppDatabase) => void,
  success?: FeedbackKey,
): Promise<void> {
  await requireSession();
  await runWithNotice(() => withDatabase(change), {
    success,
    describeFailure: describeChangeFailure,
  });
  revalidatePath(RULES_PATH);
}

export async function moveRuleAction(
  id: number,
  direction: "up" | "down",
): Promise<void> {
  await changeRules((db) => moveRule(db, id, direction));
}

export async function deleteRuleAction(id: number): Promise<void> {
  await changeRules((db) => deleteRule(db, id), "ruleDeleted");
}
