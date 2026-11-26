import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

export const phase = pgEnum("phase", ["regular_season", "playoffs", "cup"])

export const gender = pgEnum("gender", ["men", "women", "mixed"])

export const competitionKind = pgEnum("competition_kind", [
  "league",
  "cup",
  "championship",
  "qualification",
])

export const gameStatus = pgEnum("game_status", [
  "scheduled",
  "live",
  "finished",
  "postponed",
  "cancelled",
  "awarded",
])

export const decidedBy = pgEnum("decided_by", [
  "regulation",
  "overtime",
  "shootout",
])

export const country = pgTable("country", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const club = pgTable(
  "club",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: text("country_id")
      .notNull()
      .references(() => country.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("club_country_slug_idx").on(table.countryId, table.slug),
  ]
)

export const competition = pgTable(
  "competition",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: text("country_id")
      .notNull()
      .references(() => country.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    gender: gender("gender").notNull(),
    kind: competitionKind("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("competition_country_slug_idx").on(table.countryId, table.slug),
  ]
)

export const season = pgTable(
  "season",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competition.id),
    label: text("label").notNull(),
    phase: phase("phase").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("season_competition_label_phase_idx").on(
      table.competitionId,
      table.label,
      table.phase
    ),
  ]
)

export const teamSeason = pgTable(
  "team_season",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    clubId: uuid("club_id")
      .notNull()
      .references(() => club.id),
    name: text("name").notNull(),
    shortName: text("short_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("team_season_season_club_idx").on(table.seasonId, table.clubId),
  ]
)

export const game = pgTable(
  "game",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    round: text("round"),
    gameNumber: integer("game_number"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    status: gameStatus("status").notNull(),
    homeTeamSeasonId: uuid("home_team_season_id")
      .notNull()
      .references(() => teamSeason.id),
    awayTeamSeasonId: uuid("away_team_season_id")
      .notNull()
      .references(() => teamSeason.id),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    decidedBy: decidedBy("decided_by"),
    periodScores: jsonb("period_scores"),
    venue: text("venue"),
    attendance: integer("attendance"),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("game_source_external_idx").on(table.source, table.externalId),
    index("game_season_starts_idx").on(table.seasonId, table.startsAt),
  ]
)

export const sourceRef = pgTable(
  "source_ref",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: text("source").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    externalId: text("external_id").notNull(),
    payload: jsonb("payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("source_ref_source_entity_external_idx").on(
      table.source,
      table.entityType,
      table.externalId
    ),
    index("source_ref_entity_idx").on(table.entityType, table.entityId),
  ]
)

export type Country = typeof country.$inferSelect
export type Club = typeof club.$inferSelect
export type Competition = typeof competition.$inferSelect
export type Season = typeof season.$inferSelect
export type TeamSeason = typeof teamSeason.$inferSelect
export type Game = typeof game.$inferSelect
