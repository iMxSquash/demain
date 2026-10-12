export async function register() {
  // better-sqlite3 and node:fs are not available on the edge runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { initializeStorage } = await import("./instrumentation-node");
  initializeStorage();
}
