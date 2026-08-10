-- Physical thumbnails for image attachments (Cached Egress Phase 2,
-- replacing the earlier Supabase Image Transformations approach — that
-- required a project-level feature this app can't assume is enabled/on
-- plan, confirmed by a live signed URL never coming back under
-- /render/image/sign/ despite a correctly-formed createSignedUrl(...,
-- { transform }) call). uploadTicketAttachment/uploadProjectNoteAttachment
-- (src/lib/tickets.ts / src/lib/notes.ts) now generate a real, separate,
-- width-capped derivative object in Storage for image uploads and record
-- its path here; thumbnail_path is null for every non-image attachment and
-- for any image whose thumbnail generation failed or was skipped (already
-- narrower than the cap) — callers always fall back to the original
-- storage_path in that case, so this column is purely additive.
--
-- No RLS changes needed on either table or on storage.objects: the
-- existing select/insert/delete policies already authorize by row/
-- (storage.foldername(name))[1], not by column or by which specific object
-- path is being touched — a thumbnail path is written under the same
-- "<ticket_id>/..." / "<note_id>/..." first folder segment as its
-- original, so it's covered by the exact same checks already in place.

alter table public.ticket_attachments
  add column thumbnail_path text;

alter table public.project_note_attachments
  add column thumbnail_path text;
