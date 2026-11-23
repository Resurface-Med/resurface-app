-- Featured-bundle cron was every minute and overlapped with many clients
-- falling back to featured_shard over PostgREST (15–20 s each), which starved
-- Admin and everything else. Unschedule; publish still rebuilds via
-- featured_bundle_publish(). Re-add a slower cron later if needed.
select cron.unschedule(j.jobid)
  from cron.job j
 where j.jobname = 'featured-bundle';
