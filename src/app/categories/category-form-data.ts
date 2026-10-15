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

/** What the user said about one row of the to-categorize queue. */
export interface CategorizeState {
  message: string;
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
