-- Seed data. Applied after migrations, by `supabase db reset` / `tinbase` on a fresh database.
--
-- Runs as the migration role, so it bypasses RLS. That is convenient and also a trap: rows with no
-- owner are invisible to every user once an owner policy exists (`auth.uid() = user_id`), and the
-- app then looks broken while the data sits in the table. So anything owner-scoped must be stamped
-- with a real auth.users id.
--
-- The demo user below exists so seeded rows have an owner to belong to. Keep the uuid stable —
-- seeds reference it, and regenerating it orphans every seeded row. In the editor preview this
-- user is signed in automatically (the editor sets a password on it at boot), so seeded rows are
-- what the preview actually shows.

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000001', 'demo@rapidnative.com')
on conflict (id) do nothing;

-- Workspaces
insert into workspaces (id, user_id, name, description, accent_color, media_count, collaborator_count) values
  ('workspace-1', '00000000-0000-0000-0000-000000000001', 'Autumn Collection', 'Editorial fashion shoot for Harper''s Bazaar', '#B66A40', 248, 4),
  ('workspace-2', '00000000-0000-0000-0000-000000000001', 'Riverside Wedding', 'Full day coverage + highlight reel', '#C17745', 532, 3),
  ('workspace-3', '00000000-0000-0000-0000-000000000001', 'Brand Campaign — Alinea', 'Product & lifestyle photography', '#8B5E3C', 184, 5),
  ('workspace-4', '00000000-0000-0000-0000-000000000001', 'Personal Archive', 'Travel & street photography 2025', '#A0724A', 1203, 1);

-- Albums
insert into albums (id, user_id, workspace_id, name, description, cover_url, item_count, status) values
  ('album-1', '00000000-0000-0000-0000-000000000001', 'workspace-1', 'Look 1 — Golden Hour', 'Hero shots at Malibu', 'https://picsum.photos/seed/virgo-album1/400/300', 42, 'review'),
  ('album-2', '00000000-0000-0000-0000-000000000001', 'workspace-1', 'Behind the Scenes', 'Candid crew moments', 'https://picsum.photos/seed/virgo-album2/400/300', 18, 'draft'),
  ('album-3', '00000000-0000-0000-0000-000000000001', 'workspace-2', 'Ceremony Highlights', 'Vows, rings, first kiss', 'https://picsum.photos/seed/virgo-album3/400/300', 89, 'delivered'),
  ('album-4', '00000000-0000-0000-0000-000000000001', 'workspace-2', 'Reception & Dancing', 'Candid reception moments', 'https://picsum.photos/seed/virgo-album4/400/300', 134, 'review'),
  ('album-5', '00000000-0000-0000-0000-000000000001', 'workspace-3', 'Product Flatlays', 'Hero product shots on marble', 'https://picsum.photos/seed/virgo-album5/400/300', 27, 'draft'),
  ('album-6', '00000000-0000-0000-0000-000000000001', 'workspace-4', 'Tokyo Nights', 'Shibuya & Shinjuku after dark', 'https://picsum.photos/seed/virgo-album6/400/300', 61, 'draft');

-- Schedule Events
insert into schedule_events (id, user_id, workspace_id, title, description, event_date, event_time, event_type) values
  ('event-1', '00000000-0000-0000-0000-000000000001', 'workspace-1', 'Look 2 — Studio Session', 'White cyclorama, Profoto setup', now()::date + interval '1 day', '09:00', 'shoot'),
  ('event-2', '00000000-0000-0000-0000-000000000001', 'workspace-2', 'Highlight Reel Edit', 'Final cut review with couple', now()::date + interval '2 days', '14:00', 'editing'),
  ('event-3', '00000000-0000-0000-0000-000000000001', 'workspace-3', 'Client Review — Alinea', 'Deliver round 2 selects', now()::date + interval '3 days', '10:30', 'review'),
  ('event-4', '00000000-0000-0000-0000-000000000001', 'workspace-3', 'Final Delivery', 'Export & upload all finals', now()::date + interval '5 days', '16:00', 'delivery'),
  ('event-5', '00000000-0000-0000-0000-000000000001', null, 'Portfolio Review', 'Quarterly creative review with mentor', now()::date + interval '7 days', '11:00', 'meeting');

-- Collaborators
insert into collaborators (id, user_id, workspace_id, name, avatar_url, role) values
  ('collab-1', '00000000-0000-0000-0000-000000000001', 'workspace-1', 'Maya Chen', 'https://picsum.photos/seed/virgo-avatar1/100/100', 'photographer'),
  ('collab-2', '00000000-0000-0000-0000-000000000001', 'workspace-1', 'James Rivera', 'https://picsum.photos/seed/virgo-avatar2/100/100', 'editor'),
  ('collab-3', '00000000-0000-0000-0000-000000000001', 'workspace-1', 'Zara Williams', 'https://picsum.photos/seed/virgo-avatar3/100/100', 'client'),
  ('collab-4', '00000000-0000-0000-0000-000000000001', 'workspace-2', 'Diego Torres', 'https://picsum.photos/seed/virgo-avatar4/100/100', 'photographer'),
  ('collab-5', '00000000-0000-0000-0000-000000000001', 'workspace-2', 'Aisha Patel', 'https://picsum.photos/seed/virgo-avatar5/100/100', 'editor'),
  ('collab-6', '00000000-0000-0000-0000-000000000001', 'workspace-3', 'Liam O''Brien', 'https://picsum.photos/seed/virgo-avatar6/100/100', 'reviewer'),
  ('collab-7', '00000000-0000-0000-0000-000000000001', 'workspace-3', 'Sofia Reyes', 'https://picsum.photos/seed/virgo-avatar7/100/100', 'photographer'),
  ('collab-8', '00000000-0000-0000-0000-000000000001', 'workspace-3', 'Naomi Kim', 'https://picsum.photos/seed/virgo-avatar8/100/100', 'client');

-- Reminders
insert into reminders (id, user_id, schedule_event_id, title, description, reminder_time, is_alarm_enabled, has_push_notification, is_completed) values
  ('reminder-1', '00000000-0000-0000-0000-000000000001', 'event-1', 'Pack Profoto lights', 'Charge all batteries and pack gels', now() + interval '16 hours', true, true, false),
  ('reminder-2', '00000000-0000-0000-0000-000000000001', 'event-1', 'Confirm studio booking', 'Call Pier 59 to confirm 9 AM slot', now() + interval '20 hours', true, true, false),
  ('reminder-3', '00000000-0000-0000-0000-000000000001', 'event-2', 'Export timeline XML', 'Send project file to Aisha for color', now() + interval '36 hours', false, true, false),
  ('reminder-4', '00000000-0000-0000-0000-000000000001', 'event-3', 'Prepare selects folder', 'Curate top 40 from Look 1 for client review', now() + interval '60 hours', true, true, false),
  ('reminder-5', '00000000-0000-0000-0000-000000000001', null, 'Storage cleanup', 'Archive projects older than 6 months to cloud', now() + interval '96 hours', false, false, false),
  ('reminder-6', '00000000-0000-0000-0000-000000000001', null, 'Quarterly gear maintenance', 'Clean sensors, calibrate monitors', now() + interval '120 hours', true, false, false);

-- Friends (confirmed network contacts + pending requests)
insert into friends (id, user_id, friend_name, friend_email, friend_avatar_url, status, requested_by) values
  ('friend-1', '00000000-0000-0000-0000-000000000001', 'Maya Chen', 'maya@studio.co', 'https://picsum.photos/seed/virgo-avatar1/100/100', 'accepted', 'me'),
  ('friend-2', '00000000-0000-0000-0000-000000000001', 'James Rivera', 'james@edit.io', 'https://picsum.photos/seed/virgo-avatar2/100/100', 'accepted', 'them'),
  ('friend-3', '00000000-0000-0000-0000-000000000001', 'Diego Torres', 'diego@filmco.com', 'https://picsum.photos/seed/virgo-avatar4/100/100', 'accepted', 'me'),
  ('friend-4', '00000000-0000-0000-0000-000000000001', 'Aisha Patel', 'aisha@grade.studio', 'https://picsum.photos/seed/virgo-avatar5/100/100', 'accepted', 'them'),
  ('friend-5', '00000000-0000-0000-0000-000000000001', 'Sofia Reyes', 'sofia@light.co', 'https://picsum.photos/seed/virgo-avatar7/100/100', 'pending', 'me'),
  ('friend-6', '00000000-0000-0000-0000-000000000001', 'Naomi Kim', 'naomi@brand.studio', 'https://picsum.photos/seed/virgo-avatar8/100/100', 'pending', 'them'),
  ('friend-7', '00000000-0000-0000-0000-000000000001', 'Liam O''Brien', 'liam@review.studio', 'https://picsum.photos/seed/virgo-avatar6/100/100', 'accepted', 'me');
