import type { SupabaseClient } from "@supabase/supabase-js";

export interface AttachmentApplySnapshot {
  ticketAttachmentsKTVibe: number;
  ticketAttachmentsGlobal: number;
  storageObjectsUnderAffectedFolders: number;
  ticketActivityAttachmentUploadedKTVibe: number;
  projectMembershipsGlobal: number;
  projectMembershipsKTVibe: number;
  notificationsGlobal: number;
  notificationsForAffectedTickets: number;
  affectedTicketFields: { ticketId: string; updatedAt: string; hours: number | null }[];
  ticketCommentsKTVibe: number;
  ticketTimeEntriesKTVibe: number;
}

/** Read-only. Captures every count/field this task's reconciliation needs to diff against after APPLY — nothing here writes anything. */
export async function snapshotBeforeApply(admin: SupabaseClient, bucketId: string, ktvibeProjectId: string, ktvibeTicketIds: string[], affectedTicketIds: string[]): Promise<AttachmentApplySnapshot> {
  const { count: ticketAttachmentsKTVibe } = await admin.from("ticket_attachments").select("id", { count: "exact", head: true }).in("ticket_id", ktvibeTicketIds);
  const { count: ticketAttachmentsGlobal } = await admin.from("ticket_attachments").select("id", { count: "exact", head: true });

  let storageObjectsUnderAffectedFolders = 0;
  const storage = admin.storage.from(bucketId);
  for (const ticketId of affectedTicketIds) {
    const { data } = await storage.list(ticketId, { limit: 1000 });
    storageObjectsUnderAffectedFolders += (data ?? []).length;
  }

  const { count: ticketActivityAttachmentUploadedKTVibe } = await admin.from("ticket_activity").select("id", { count: "exact", head: true }).eq("event_type", "attachment_uploaded").in("ticket_id", ktvibeTicketIds);
  const { count: projectMembershipsGlobal } = await admin.from("project_memberships").select("id", { count: "exact", head: true });
  const { count: projectMembershipsKTVibe } = await admin.from("project_memberships").select("id", { count: "exact", head: true }).eq("project_id", ktvibeProjectId);
  const { count: notificationsGlobal } = await admin.from("notifications").select("id", { count: "exact", head: true });
  const { count: notificationsForAffectedTickets } = await admin.from("notifications").select("id", { count: "exact", head: true }).in("ticket_id", affectedTicketIds);

  const { data: ticketRows } = await admin.from("tickets").select("id, updated_at, hours").in("id", affectedTicketIds);
  const affectedTicketFields = (ticketRows ?? []).map((t) => ({ ticketId: t.id as string, updatedAt: t.updated_at as string, hours: t.hours as number | null }));

  const { count: ticketCommentsKTVibe } = await admin.from("ticket_comments").select("id", { count: "exact", head: true }).in("ticket_id", ktvibeTicketIds);
  const { count: ticketTimeEntriesKTVibe } = await admin.from("ticket_time_entries").select("id", { count: "exact", head: true }).in("ticket_id", ktvibeTicketIds);

  return {
    ticketAttachmentsKTVibe: ticketAttachmentsKTVibe ?? 0,
    ticketAttachmentsGlobal: ticketAttachmentsGlobal ?? 0,
    storageObjectsUnderAffectedFolders,
    ticketActivityAttachmentUploadedKTVibe: ticketActivityAttachmentUploadedKTVibe ?? 0,
    projectMembershipsGlobal: projectMembershipsGlobal ?? 0,
    projectMembershipsKTVibe: projectMembershipsKTVibe ?? 0,
    notificationsGlobal: notificationsGlobal ?? 0,
    notificationsForAffectedTickets: notificationsForAffectedTickets ?? 0,
    affectedTicketFields,
    ticketCommentsKTVibe: ticketCommentsKTVibe ?? 0,
    ticketTimeEntriesKTVibe: ticketTimeEntriesKTVibe ?? 0,
  };
}
