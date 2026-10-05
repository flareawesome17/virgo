-- When somebody last looked at Connect › People.
--
-- Connection requests and hire enquiries lit the Messages dot until each one
-- was answered, so ignoring a stranger's request meant a dot that never went
-- out. They now count towards it only until People has been opened, the way
-- the Jobs badge counts postings newer than jobs_seen_at. The requests
-- themselves stay listed until they are answered.
--
-- Null is "never looked", which counts everything still waiting.
set local lock_timeout = '5s';

alter table users add column if not exists people_seen_at timestamptz;
