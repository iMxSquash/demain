import { z } from "zod";

const envSchema = z.object({
  DEMAIN_DATA_DIR: z
    .string({ error: "is required" })
    .trim()
    .min(1, { error: "must not be empty" }),
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
