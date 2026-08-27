-- Supports the digest worker's exact filter shape (Fase 3B):
--   WHERE organization_id = ? AND recipient_profile_id = ?
--     AND read_at IS NULL AND created_at > ?
-- None of the three existing notifications indexes
-- (recipient_created_idx, recipient_read_idx, organization_id_idx —
-- 20260817000000) cover this combination as one index scan: the closest,
-- recipient_created_idx, has no organization_id and isn't partial on
-- read_at IS NULL, so it would still scan every read notification for a
-- long-tenured recipient. Partial (WHERE read_at IS NULL) keeps this
-- index small — it only ever needs to hold currently-unread rows, and a
-- notification leaves it the moment it's marked read.
create index notifications_org_recipient_unread_idx
  on public.notifications (organization_id, recipient_profile_id, created_at)
  where read_at is null;
