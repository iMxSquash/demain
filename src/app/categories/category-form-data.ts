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
