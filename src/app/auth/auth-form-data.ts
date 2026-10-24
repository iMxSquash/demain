/** Outcome of a refused submit. Messages are generic on purpose (OWASP, authentication). */
export interface AuthFormState {
  message: string;
}

export function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
