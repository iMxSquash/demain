"use server";

import { revalidatePath } from "next/cache";

import { messageRef } from "../../domain/message";
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
    return { message: translate(messageRef("nothingSaved")), values };
  }

  revalidatePath(RULES_PATH);
  return null;
}

async function changeRules(change: (db: AppDatabase) => void): Promise<void> {
  await requireSession();
  try {
    withDatabase(change);
  } catch (error) {
    // Already gone since the page was loaded: the refreshed page shows it.
    if (!(error instanceof RuleNotFoundError)) throw error;
  }
  revalidatePath(RULES_PATH);
}

export async function moveRuleAction(
  id: number,
  direction: "up" | "down",
): Promise<void> {
  await changeRules((db) => moveRule(db, id, direction));
}

export async function deleteRuleAction(id: number): Promise<void> {
  await changeRules((db) => deleteRule(db, id));
}
