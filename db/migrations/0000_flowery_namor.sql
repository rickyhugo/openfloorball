CREATE TYPE "public"."competition_kind" AS ENUM('league', 'cup', 'championship', 'qualification');--> statement-breakpoint
CREATE TYPE "public"."decided_by" AS ENUM('regulation', 'overtime', 'shootout');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('scheduled', 'live', 'finished', 'postponed', 'cancelled', 'awarded');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('men', 'women', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."phase" AS ENUM('regular_season', 'playoffs', 'cup');--> statement-breakpoint
CREATE TABLE "club" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"gender" "gender" NOT NULL,
	"kind" "competition_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"round" text,
	"game_number" integer,
	"starts_at" timestamp with time zone,
	"status" "game_status" NOT NULL,
	"home_team_season_id" uuid NOT NULL,
	"away_team_season_id" uuid NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"decided_by" "decided_by",
	"period_scores" jsonb,
	"venue" text,
	"attendance" integer,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"source_updated_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"label" text NOT NULL,
	"phase" "phase" NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_ref" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_season" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club" ADD CONSTRAINT "club_country_id_country_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."country"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_country_id_country_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."country"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game" ADD CONSTRAINT "game_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game" ADD CONSTRAINT "game_home_team_season_id_team_season_id_fk" FOREIGN KEY ("home_team_season_id") REFERENCES "public"."team_season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game" ADD CONSTRAINT "game_away_team_season_id_team_season_id_fk" FOREIGN KEY ("away_team_season_id") REFERENCES "public"."team_season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_season" ADD CONSTRAINT "team_season_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_season" ADD CONSTRAINT "team_season_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "club_country_slug_idx" ON "club" USING btree ("country_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_country_slug_idx" ON "competition" USING btree ("country_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "game_source_external_idx" ON "game" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "game_season_starts_idx" ON "game" USING btree ("season_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "season_competition_label_phase_idx" ON "season" USING btree ("competition_id","label","phase");--> statement-breakpoint
CREATE UNIQUE INDEX "source_ref_source_entity_external_idx" ON "source_ref" USING btree ("source","entity_type","external_id");--> statement-breakpoint
CREATE INDEX "source_ref_entity_idx" ON "source_ref" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_season_season_club_idx" ON "team_season" USING btree ("season_id","club_id");