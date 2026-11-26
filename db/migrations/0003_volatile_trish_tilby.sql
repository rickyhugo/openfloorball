DROP INDEX "team_season_source_external_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "team_season_season_source_external_idx" ON "team_season" USING btree ("season_id","source","external_id");