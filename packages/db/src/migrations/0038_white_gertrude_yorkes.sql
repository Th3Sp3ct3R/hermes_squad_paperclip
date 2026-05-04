CREATE TABLE "suno_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid,
	"concept" text NOT NULL,
	"target_chakra" text NOT NULL,
	"target_frequency" integer NOT NULL,
	"genre" text,
	"lyrics_agent_id" uuid,
	"sound_agent_id" uuid,
	"visual_agent_id" uuid,
	"suno_song_id" text,
	"audio_url" text,
	"thumbnail_url" text,
	"video_url" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suno_issues" ADD CONSTRAINT "suno_issues_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suno_issues" ADD CONSTRAINT "suno_issues_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suno_issues" ADD CONSTRAINT "suno_issues_lyrics_agent_id_agents_id_fk" FOREIGN KEY ("lyrics_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suno_issues" ADD CONSTRAINT "suno_issues_sound_agent_id_agents_id_fk" FOREIGN KEY ("sound_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suno_issues" ADD CONSTRAINT "suno_issues_visual_agent_id_agents_id_fk" FOREIGN KEY ("visual_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suno_issues_company_status_idx" ON "suno_issues" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "suno_issues_company_chakra_idx" ON "suno_issues" USING btree ("company_id","target_chakra");--> statement-breakpoint
CREATE INDEX "suno_issues_company_created_idx" ON "suno_issues" USING btree ("company_id","created_at");