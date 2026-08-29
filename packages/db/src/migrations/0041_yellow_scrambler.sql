CREATE TABLE IF NOT EXISTS "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"from_agent_id" uuid,
	"from_user_id" text,
	"to_agent_id" uuid,
	"to_user_id" text,
	"in_reply_to" uuid,
	"thread_id" uuid NOT NULL,
	"kind" text DEFAULT 'chat' NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"body_meta" jsonb,
	"entity_type" text,
	"entity_id" text,
	"status" text DEFAULT 'unread' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
ALTER TABLE "suno_issues" ADD COLUMN IF NOT EXISTS "scheduled_publish_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "suno_issues" ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "suno_issues" ADD COLUMN IF NOT EXISTS "publish_targets" jsonb;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_from_agent_id_agents_id_fk" FOREIGN KEY ("from_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_to_agent_id_agents_id_fk" FOREIGN KEY ("to_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_messages_company_created_idx" ON "agent_messages" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_messages_thread_idx" ON "agent_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_messages_to_agent_idx" ON "agent_messages" USING btree ("to_agent_id","status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_messages_to_user_idx" ON "agent_messages" USING btree ("to_user_id","status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_logs_company_created_at_idx" ON "usage_logs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suno_issues_scheduled_publish_at_idx" ON "suno_issues" USING btree ("scheduled_publish_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suno_issues_company_scheduled_idx" ON "suno_issues" USING btree ("company_id","scheduled_publish_at");