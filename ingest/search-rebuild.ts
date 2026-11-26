import { rebuildSearch, refreshSearch } from "./search-schema"

await rebuildSearch()
await refreshSearch()
console.log("search view rebuilt")
