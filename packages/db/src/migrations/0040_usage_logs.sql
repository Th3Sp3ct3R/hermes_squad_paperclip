CREATE TABLE IF NOT EXISTS "usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"call_type" text NOT NULL,
	"stage" text,
	"suno_issue_id" uuid,
	"agent_id" uuid,
	"tokens_in" integer DEFAULT 0,
	"tokens_out" integer DEFAULT 0,
	"tokens_cached" integer DEFAULT 0,
	"tokens_total" integer DEFAULT 0,
	"cost_cents" integer DEFAULT 0,
	"duration_ms" integer DEFAULT 0,
	"status_code" integer,
	"success" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_logs_company_created_at_idx" ON "usage_logs" USING btree ("company_id","created_at");
