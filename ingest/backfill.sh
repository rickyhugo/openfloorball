#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."

seasons=(
	"39:2021-22"
	"40:2022-23"
	"41:2023-24"
	"42:2024-25"
	"43:2025-26"
)

for entry in "${seasons[@]}"; do
	id="${entry%%:*}"
	label="${entry##*:}"
	echo "=== collect $label ($id)"
	IBIS_SEASON="$id" IBIS_SEASON_LABEL="$label" npx tsx ingest/collect.ts
	if [ -f "data/raw/ibis/$label/competitions.json" ]; then
		echo "=== load $label"
		IBIS_SEASON_LABEL="$label" doppler run -- npx tsx ingest/load.ts
	else
		echo "=== skip load $label: no census"
	fi
done
echo "=== backfill complete"
