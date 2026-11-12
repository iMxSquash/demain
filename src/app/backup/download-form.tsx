"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";

import { useNotify } from "../feedback/toast-provider";
import { CONTROL_CLASS, FormField } from "../form-field";

interface DownloadFormProps {
  /** Route handler that builds the file. */
  endpoint: string;
  passwordLabel: string;
  confirmationLabel: string;
  submitLabel: string;
  doneMessage: string;
  /** Whether a blank password is accepted, which gives a plain file. */
  isPasswordOptional?: boolean;
}

const FILE_NAME_PATTERN = /filename="([^"]+)"/;
const FALLBACK_FILE_NAME = "demain-backup";
// The browser starts reading the blob asynchronously after the click.
const REVOKE_DELAY_MS = 60_000;

type Outcome =
  | { file: Blob; contentDisposition: string | null }
  | { message: string | null };

/**
 * The file comes from a POST so that the password never appears in a URL or a
 * log. It is fetched, then handed to the browser as a download, which keeps the
 * errors on the page where a navigation would replace it with raw JSON.
 */
export function DownloadForm({
  endpoint,
  passwordLabel,
  confirmationLabel,
  submitLabel,
  doneMessage,
  isPasswordOptional = false,
}: DownloadFormProps) {
  const t = useTranslations("backup");
  const notify = useNotify();
  const passwordId = useId();
  const confirmationId = useId();
  const [isPending, setIsPending] = useState(false);

  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setIsPending(true);
    try {
      const outcome = await requestFile(endpoint, new FormData(form));
      if ("file" in outcome) {
        saveFile(outcome.file, outcome.contentDisposition);
        form.reset();
        notify("success", doneMessage);
      } else {
        notify("error", outcome.message ?? t("failed"));
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={download} className="flex max-w-md flex-col gap-4" noValidate>
      <FormField id={passwordId} label={passwordLabel}>
        <input
          id={passwordId}
          name="password"
          type="password"
          required={!isPasswordOptional}
          autoComplete="new-password"
          spellCheck={false}
          className={CONTROL_CLASS}
        />
      </FormField>
      <FormField id={confirmationId} label={confirmationLabel}>
        <input
          id={confirmationId}
          name="passwordConfirmation"
          type="password"
          required={!isPasswordOptional}
          autoComplete="new-password"
          spellCheck={false}
          className={CONTROL_CLASS}
        />
      </FormField>
      <button
        type="submit"
        disabled={isPending}
        className="min-h-11 self-start rounded-pill bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60"
      >
        {submitLabel}
      </button>
      <p role="status">{isPending ? t("working") : null}</p>
    </form>
  );
}

/**
 * The server answers a refusal with `{ message }`. Anything else (a proxy error
 * page, a dropped connection) has no usable message: the caller shows a generic one.
 */
async function requestFile(endpoint: string, body: FormData): Promise<Outcome> {
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", body });
  } catch (error) {
    if (error instanceof TypeError) {
      return { message: null };
    }
    throw error;
  }
  if (response.ok) {
    return { file: await response.blob(), contentDisposition: response.headers.get("Content-Disposition") };
  }
  try {
    const refusal: unknown = await response.json();
    const message = (refusal as { message?: unknown } | null)?.message;
    return { message: typeof message === "string" ? message : null };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { message: null };
    }
    throw error;
  }
}

function saveFile(blob: Blob, contentDisposition: string | null): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = FILE_NAME_PATTERN.exec(contentDisposition ?? "")?.[1] ?? FALLBACK_FILE_NAME;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
