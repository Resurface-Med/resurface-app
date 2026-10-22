-- Jacob's Endocrine sits in Year 2 beside Renal, and only for the same
-- reviewer who can see Rayan's deck (2026-10-22). Rayan's leaves the folder.

do $$
declare
  renal uuid := 'f43ea162-6c44-4648-a418-5a5f55a3260b';
  endo uuid;
  viewer uuid;
  n int;
begin
  select d.id into endo
    from decks d
    join decks renal_deck on renal_deck.id = renal
   where d.owner_id = renal_deck.owner_id
     and d.parent_id = renal_deck.parent_id
     and d.name = 'Endocrine'
     and d.source_deck_id is null;
  if endo is null then
    raise exception 'expected Jacob''s Endocrine deck beside Renal';
  end if;

  select count(*) into n from featured_audience where deck_id = (
    select f.deck_id from featured_decks f
     where f.byline = 'Rayan' and f.listed = false
  );
  if n <> 1 then
    raise exception 'expected one reviewer on Rayan''s deck, found %', n;
  end if;
  select a.user_id into viewer
    from featured_audience a
    join featured_decks f on f.deck_id = a.deck_id
   where f.byline = 'Rayan' and f.listed = false;

  insert into featured_decks (deck_id, byline, folder, listed, position)
  values (endo, 'Jacob', 'Year 2', false, 1)
  on conflict (deck_id) do update
    set byline = 'Jacob', folder = 'Year 2', listed = false, position = 1;

  insert into featured_audience (deck_id, user_id)
  values (endo, viewer)
  on conflict do nothing;

  delete from featured_audience where deck_id = endo and user_id <> viewer;

  update featured_decks
     set folder = null, position = 2
   where byline = 'Rayan' and listed = false;
end $$;
