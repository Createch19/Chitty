/** After a change to a seat, refresh any open room of its chit (the old link's phone then gets "gone"). */
import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { month } from "@/db/schema";
import { publish } from "./events";

export async function openRoomsAfter(tx: Tx, chitId: string) {
  const ids = (await tx.select({ id: month.id }).from(month).where(and(eq(month.chitId, chitId), eq(month.status, "open")))).map((m) => m.id);
  return () => ids.forEach(publish);
}
