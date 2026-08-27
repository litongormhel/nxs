# Settings — Current State

## Implemented

Nothing beyond routing. `app/settings/page.tsx` is an 8-line stub
("Coming soon.") — same pattern as the other unbuilt modules.

## Not yet implemented — see roadmap

- No settings persistence exists anywhere (no `settings` table in the
  schema at all). Catalog-like config currently lives directly in tables
  (`services`, `addons`, `promos`, `rooms`, `lockers`) rather than a
  generic settings store — any future Settings UI would likely manage those
  tables directly rather than introduce a new config layer, but that's a
  design decision for whoever builds it, not something decided yet.
