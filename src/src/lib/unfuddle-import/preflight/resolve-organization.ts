import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrganizationPrecheckResult } from "../types/phase2";

/** Resolves the target organization by its stable slug — never a hardcoded UUID. Fails on 0 or >1 matches. */
export async function resolveOrganization(admin: SupabaseClient, slug: string): Promise<OrganizationPrecheckResult> {
  const { data, error } = await admin.from("organizations").select("id, name, slug").eq("slug", slug);

  if (error) {
    return { slug, matchCount: 0, organizationId: null, name: null, error: `organizations query failed: ${error.message}` };
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return { slug, matchCount: 0, organizationId: null, name: null, error: `No organization found with slug "${slug}".` };
  }
  if (rows.length > 1) {
    return {
      slug,
      matchCount: rows.length,
      organizationId: null,
      name: null,
      error: `${rows.length} organizations matched slug "${slug}" — expected exactly one.`,
    };
  }

  return { slug, matchCount: 1, organizationId: rows[0].id as string, name: rows[0].name as string, error: null };
}
