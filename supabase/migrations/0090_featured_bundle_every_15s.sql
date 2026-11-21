-- Ready-made deck edits go live in seconds, not up to a minute (2026-11-21).
--
-- With Year 3 the bundle is 13,000 questions and featured_bundle_build()
-- takes about 9.4 s. A signed-in call stops at 8 s (statement_timeout on
-- authenticated), so featured_bundle_publish(), which the app's editor calls
-- after every save, now always times out, and its failure is swallowed. The
-- only rebuild left was this cron, once a minute. Edits made through the
-- Claude connector, which never called publish at all, waited for it too.
--
-- The cron runs as postgres, so it has no 8 s limit. Every 15 seconds is
-- cheap when nothing changed: featured_bundle_refresh() compares versions
-- and returns without building, and its advisory lock skips a run that
-- would overlap one still building.

select cron.unschedule('featured-bundle');
select cron.schedule('featured-bundle', '15 seconds', 'select public.featured_bundle_refresh()');
