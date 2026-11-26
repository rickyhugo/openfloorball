CREATE TABLE "goalie_competition_stat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"team_season_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"matches" integer NOT NULL,
	"shots_against" integer NOT NULL,
	"goals_against" integer NOT NULL,
	"save_percentage" real NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_competition_stat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"team_season_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"matches" integer NOT NULL,
	"goals" integer NOT NULL,
	"assists" integer NOT NULL,
	"points" integer NOT NULL,
	"penalty_minutes" integer DEFAULT 0 NOT NULL,
	"power_play_goals" integer DEFAULT 0 NOT NULL,
	"power_play_assists" integer DEFAULT 0 NOT NULL,
	"box_play_goals" integer DEFAULT 0 NOT NULL,
	"box_play_assists" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roster_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"team_season_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_season_stat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"team_season_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"played" integer NOT NULL,
	"wins" integer NOT NULL,
	"overtime_wins" integer NOT NULL,
	"overtime_losses" integer NOT NULL,
	"losses" integer NOT NULL,
	"goals_for" integer NOT NULL,
	"goals_against" integer NOT NULL,
	"points" integer NOT NULL,
	"power_play_goals" integer DEFAULT 0 NOT NULL,
	"box_play_goals" integer DEFAULT 0 NOT NULL,
	"penalty_minutes" integer DEFAULT 0 NOT NULL,
	"attendance_total" integer,
	"attendance_average" real,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "team_season_season_club_idx";--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "source" text NOT NULL;--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "external_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "category_id" integer;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "category_name" text;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "source" text NOT NULL;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "external_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "team_season" ADD COLUMN "source" text NOT NULL;--> statement-breakpoint
ALTER TABLE "team_season" ADD COLUMN "external_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "goalie_competition_stat" ADD CONSTRAINT "goalie_competition_stat_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goalie_competition_stat" ADD CONSTRAINT "goalie_competition_stat_team_season_id_team_season_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "public"."team_season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goalie_competition_stat" ADD CONSTRAINT "goalie_competition_stat_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_competition_stat" ADD CONSTRAINT "player_competition_stat_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_competition_stat" ADD CONSTRAINT "player_competition_stat_team_season_id_team_season_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "public"."team_season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_competition_stat" ADD CONSTRAINT "player_competition_stat_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_entry_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_entry_team_season_id_team_season_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "public"."team_season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entry" ADD CONSTRAINT "roster_entry_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_season_stat" ADD CONSTRAINT "team_season_stat_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_season_stat" ADD CONSTRAINT "team_season_stat_team_season_id_team_season_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "public"."team_season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "goalie_competition_stat_season_team_player_idx" ON "goalie_competition_stat" USING btree ("season_id","team_season_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_source_external_idx" ON "player" USING btree ("source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_competition_stat_season_team_player_idx" ON "player_competition_stat" USING btree ("season_id","team_season_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_entry_season_team_player_idx" ON "roster_entry" USING btree ("season_id","team_season_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_season_stat_season_team_idx" ON "team_season_stat" USING btree ("season_id","team_season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "club_source_external_idx" ON "club" USING btree ("source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_source_external_idx" ON "competition" USING btree ("source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_season_source_external_idx" ON "team_season" USING btree ("source","external_id");