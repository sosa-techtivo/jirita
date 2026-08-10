-- Extends insert_ticket_attachments_bypassing_activity_log (20260825000000)
-- to also persist thumbnail_path (added generally in
-- 20260922000000_add_attachment_thumbnails.sql, already used by real app
-- uploads and the historical live-data backfill) — so a *future* Unfuddle
-- project migration can arrive with thumbnail_path already populated
-- instead of NULL for every imported row.
--
-- Purely additive: `nullif(r ->> 'thumbnail_path', '')` means a caller that
-- omits the key (every existing planned row shape, including the already-
-- completed KTVibe import — never re-run, never touched by this migration)
-- inserts thumbnail_path = NULL, byte-for-byte the same as before this
-- migration existed. No other column, trigger, or policy on
-- ticket_attachments is touched.

create or replace function public.insert_ticket_attachments_bypassing_activity_log(attachment_rows jsonb)
returns setof public.ticket_attachments
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform set_config('jirita.import_bypass_activity_log', 'true', true);

  return query
    insert into public.ticket_attachments (
      ticket_id, comment_id, filename, storage_path, size_bytes, mime_type, uploaded_by, created_at, updated_at, unfuddle_id, thumbnail_path
    )
    select
      (r ->> 'ticket_id')::uuid,
      nullif(r ->> 'comment_id', '')::uuid,
      r ->> 'filename',
      r ->> 'storage_path',
      (r ->> 'size_bytes')::bigint,
      nullif(r ->> 'mime_type', ''),
      nullif(r ->> 'uploaded_by', '')::uuid,
      (r ->> 'created_at')::timestamptz,
      nullif(r ->> 'updated_at', '')::timestamptz,
      r ->> 'unfuddle_id',
      nullif(r ->> 'thumbnail_path', '')
    from jsonb_array_elements(attachment_rows) as r
    returning *;
end;
$$;

comment on function public.insert_ticket_attachments_bypassing_activity_log(jsonb) is
  'Historical-import-only. Inserts ticket_attachments rows (including an '
  'optional thumbnail_path, added 20260923000000) while suppressing the '
  'synthetic ticket_attachments_log_activity ticket_activity row, scoped to '
  'this transaction only via the same LOCAL custom GUC tickets/comments/ '
  'time entries already use (jirita.import_bypass_activity_log). Never '
  'touches Supabase Storage. Never call from client code — EXECUTE is '
  'restricted to service_role.';
