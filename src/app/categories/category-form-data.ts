import { messageRef, type Translate } from "../../domain/message";

export interface CategoryFormState {
  field?: "name";
  message: string;
  /** What the user typed: React resets the form after an action, so it is sent back. */
  name: string;
}

export function readCategoryName(formData: FormData): string {
  const value = formData.get("name");
  return typeof value === "string" ? value : "";
}

/** What the user typed in one row of the queue, with the rule suggestion. */
export interface CategorizeValues {
  categoryId: string;
  createRule: boolean;
  ruleOperator: string;
  ruleValue: string;
}

/** What the user said about one row of the to-categorize queue. */
export interface CategorizeState {
  message: string;
  /** The control the message is about, so that it is linked to that one. */
  field: "category" | "rule";
  /** Sent back for a refused rule: React resets the form after an action. */
  values?: CategorizeValues;
}

export function readCategorizeValues(formData: FormData): CategorizeValues {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    categoryId: text("categoryId"),
    createRule: formData.get("createRule") !== null,
    ruleOperator: text("ruleOperator"),
    ruleValue: text("ruleValue"),
  };
}

export type ParsedCategoryChoice =
  | { ok: true; categoryId: number }
  | { ok: false; message: string };

export function parseCategoryChoice(
  formData: FormData,
  translate: Translate,
): ParsedCategoryChoice {
  const raw = formData.get("categoryId");
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, message: translate(messageRef("categoryChoose")) };
  }
  const categoryId = Number(raw);
  if (!Number.isSafeInteger(categoryId)) {
    return { ok: false, message: translate(messageRef("categoryUnknown")) };
  }
  return { ok: true, categoryId };
}
