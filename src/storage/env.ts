import { z } from "zod";

const SETUP_TOKEN_MIN_LENGTH = 32;

const envSchema = z.object({
  DEMAIN_DATA_DIR: z
    .string({ error: "is required" })
    .trim()
    .min(1, { error: "must not be empty" }),
  // Only needed until the account exists. A blank value (typical of a compose
  // file) counts as unset.
  DEMAIN_SETUP_TOKEN: z
    .string()
    .trim()
    .min(SETUP_TOKEN_MIN_LENGTH, {
      error: `must be at least ${SETUP_TOKEN_MIN_LENGTH} characters`,
    })
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) {
    return result.data;
  }

  const problems = result.error.issues
    .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new EnvError(
    `Invalid environment, the application cannot start:\n${problems}\nSee .env.example for the expected variables.`,
  );
}
