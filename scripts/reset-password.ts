// Offline password recovery: there is no e-mail reset, access to the host is
// the proof of ownership (ARCHITECTURE, deployment). Run inside the container:
//   node scripts/reset-password.ts
// Node runs this file directly, which is why the modules it reaches import
// each other with their .ts extension.
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, resetPassword } from "../src/auth/owner.ts";
import { openDatabase } from "../src/storage/database.ts";
import { EnvError, parseEnv } from "../src/storage/env.ts";

const CTRL_C = "\u0003";
const BACKSPACE = "\u007f";

async function main(): Promise<void> {
  const env = parseEnv(process.env);

  const password = await readSecret("New password: ");
  if (process.stdin.isTTY && password !== (await readSecret("Repeat the new password: "))) {
    throw new Failure("The two passwords do not match.");
  }

  const db = openDatabase(env.DEMAIN_DATA_DIR);
  try {
    const result = await resetPassword(db, password);
    if (result.ok) {
      console.log("Password reset. Every open session has been signed out.");
      return;
    }
    throw new Failure(describe(result.reason));
  } finally {
    db.$client.close();
  }
}

function describe(reason: "noOwner" | "tooShort" | "tooLong"): string {
  switch (reason) {
    case "noOwner":
      return "No account exists yet. Create it from the setup page.";
    case "tooShort":
      return `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    case "tooLong":
      return `The password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
}

/** A refusal the operator can act on, as opposed to a bug worth a stack trace. */
class Failure extends Error {}

/** Without a terminal (`docker exec -i`), the password is the first line of stdin. */
async function readSecret(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    let data = "";
    for await (const chunk of stdin) {
      data += String(chunk);
    }
    return data.split(/\r?\n/)[0] ?? "";
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (settle: () => void) => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      settle();
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          return finish(() => resolve(value));
        }
        if (char === CTRL_C) {
          return finish(() => reject(new Failure("Cancelled.")));
        }
        value = char === BACKSPACE ? value.slice(0, -1) : value + char;
      }
    };
    stdin.on("data", onData);
  });
}

main().catch((error: unknown) => {
  if (error instanceof Failure || error instanceof EnvError) {
    console.error(error.message);
  } else {
    console.error(
      `Unexpected failure: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  process.exitCode = 1;
});
