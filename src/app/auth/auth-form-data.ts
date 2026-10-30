/**
 * A credential form. A refusal is told in a toast, with a message that is
 * generic on purpose (OWASP, authentication), so the form has no state to show.
 */
export type AuthFormAction = (previous: null, formData: FormData) => Promise<null>;

export function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
