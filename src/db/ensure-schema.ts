import { pool } from './index';

// Self-provisioning schema: creates every table on first use so a fresh
// database (Neon/Supabase/Vercel Postgres) works without running
// `drizzle-kit push`. Every statement is idempotent and mirrors
// `npx drizzle-kit export` for src/db/schema.ts.
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "administrators" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "username" text NOT NULL,
    "name" text NOT NULL,
    "password_hash" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "administrators_username_unique" UNIQUE("username")
  )`,
  `CREATE TABLE IF NOT EXISTS "spj_transactions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "number" text NOT NULL,
    "category" text NOT NULL,
    "title" text NOT NULL,
    "date" text NOT NULL,
    "year" integer NOT NULL,
    "amount" numeric(18, 0) NOT NULL,
    "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "finalized" boolean DEFAULT false NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "spj_transactions_number_unique" UNIQUE("number")
  )`,
  `CREATE TABLE IF NOT EXISTS "spj_attachments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "transaction_id" uuid,
    "kind" text NOT NULL,
    "name" text NOT NULL,
    "mime" text NOT NULL,
    "size" integer NOT NULL,
    "content" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "audit_log" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "transaction_id" uuid,
    "action" text NOT NULL,
    "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "document_templates" (
    "key" text PRIMARY KEY NOT NULL,
    "title" text NOT NULL,
    "content" text NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "receipt_counters" (
    "year" integer PRIMARY KEY NOT NULL,
    "value" integer DEFAULT 0 NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "school_settings" (
    "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
    "data" jsonb NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "admin_sessions" (
    "token" text PRIMARY KEY NOT NULL,
    "user_id" uuid NOT NULL,
    "expires_at" timestamp NOT NULL
  )`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'spj_attachments_transaction_id_spj_transactions_id_fk') THEN
      ALTER TABLE "spj_attachments" ADD CONSTRAINT "spj_attachments_transaction_id_spj_transactions_id_fk"
        FOREIGN KEY ("transaction_id") REFERENCES "public"."spj_transactions"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_sessions_user_id_administrators_id_fk') THEN
      ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_administrators_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "public"."administrators"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END $$`,
];

const globalForSchema = globalThis as typeof globalThis & { __spjSchemaReady?: Promise<void> };

async function provision() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize concurrent cold starts (several serverless instances at once).
    await client.query('SELECT pg_advisory_xact_lock(724519)');
    for (const statement of STATEMENTS) await client.query(statement);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function ensureSchema(): Promise<void> {
  if (!globalForSchema.__spjSchemaReady) {
    globalForSchema.__spjSchemaReady = provision().catch(error => {
      // Allow a retry on the next request (e.g., database was still waking up).
      globalForSchema.__spjSchemaReady = undefined;
      throw error;
    });
  }
  return globalForSchema.__spjSchemaReady;
}
