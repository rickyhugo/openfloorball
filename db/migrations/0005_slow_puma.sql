ALTER TABLE "goalie_competition_stat" ALTER COLUMN "shots_against" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "goalie_competition_stat" ALTER COLUMN "goals_against" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "goalie_competition_stat" ALTER COLUMN "save_percentage" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "goalie_competition_stat" ADD COLUMN "clean_sheets" integer;--> statement-breakpoint
ALTER TABLE "player_competition_stat" ADD COLUMN "plus_minus" integer;--> statement-breakpoint
ALTER TABLE "player_competition_stat" ADD COLUMN "shots" integer;--> statement-breakpoint
ALTER TABLE "player_competition_stat" ADD COLUMN "blocks" integer;