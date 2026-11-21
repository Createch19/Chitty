/** Runs once when the server starts: open the database (runs migrations) and seed the Super Admin. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getDb } = await import("./db/client");
  const { ensureSuperAdmin } = await import("./server/accounts");
  const db = await getDb();
  const mobile = process.env.SUPERADMIN_MOBILE;
  const password = process.env.SUPERADMIN_PASSWORD;
  if (mobile && password) {
    const r = await ensureSuperAdmin(db, { mobile, password });
    if (r === "created") console.log("[chitty] Super Admin created");
  }
  if (process.env.CHITTY_SCHEDULER !== "off") {
    const { startScheduler } = await import("./server/scheduler");
    startScheduler(getDb);
  }
}
