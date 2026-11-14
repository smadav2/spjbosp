import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ensureSchema } from "@/db/ensure-schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    await ensureSchema();
    return Response.json({ ok: true, schema: "ready" });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ ok: false, error: "Database tidak dapat diakses atau tabel tidak dapat dibuat. Periksa DATABASE_URL." }, { status: 500 });
  }
}
