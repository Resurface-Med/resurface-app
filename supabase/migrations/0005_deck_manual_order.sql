-- Deck order becomes manual (2026-10-15).
--
-- Until now the app drew siblings alphabetically whatever `position` said, and
-- `position` held creation order. Renumber every parent's decks into the
-- order people actually see — natural, case-insensitive, as Intl.Collator
-- with { numeric: true, sensitivity: "base" } sorts — spaced 1024 apart, so
-- switching the app to manual order moves nothing on anyone's screen, and a
-- move can land between two decks without renumbering (lib/deckOrder.js).

create collation if not exists public.deck_natural (provider = icu, locale = 'en-u-kn-true-ks-level1');

update public.decks d
   set position = r.rn * 1024
  from (
    select id, row_number() over (
             partition by owner_id, parent_id
             order by name collate public.deck_natural, created_at
           ) as rn
      from public.decks
  ) r
 where r.id = d.id;

drop collation public.deck_natural;
