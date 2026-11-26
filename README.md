# OpenFloorball

Floorball statistics, tables and reports. It starts with Sweden and is built to cover every federation and the World Championships.

## Stack

Astro renders the pages on the server. React islands handle the interactive parts, and shadcn/ui supplies the controls. Data lives in Postgres. The decision record is in `docs/adr/0001-stack-and-data-model.md`.

## Commands

```sh
npm install
npm run dev
npm run build
npm run typecheck
npm run lint
```

## Status

One page exists. It shows the SSL Herrar 2024/25 standings from a fixture. Ingestion, Postgres and every other competition are not built yet.
