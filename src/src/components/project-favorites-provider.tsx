"use client";

// Root-level provider for the Sidebar's Favorites accordion — mirrors
// organization-projects-provider.tsx's own reasoning for existing at all:
// Sidebar (via app-shell.tsx) remounts on every page navigation (it's
// rendered per-page, not from a shared layout), so favorites are fetched
// once here at the true root layout instead of refetching — and briefly
// flashing an empty "No favorites yet" — on every single navigation.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useCurrentUser } from "@/components/current-user-provider";
import { loadFavoriteProjectSlugs, addProjectFavorite, removeProjectFavorite } from "@/lib/projects";
import { ErrorToast } from "@/components/tickets/ticket-ui";

export type ProjectFavoritesStatus = "loading" | "ready";

interface ProjectFavoritesContextValue {
  status: ProjectFavoritesStatus;
  favoriteSlugs: Set<string>;
  /** Optimistic: flips immediately, fires the real write in the background,
   *  and reverts (with an error toast) if that write fails. Never
   *  navigates — purely a mark/unmark. */
  toggleFavorite: (slug: string) => void;
}

const ProjectFavoritesContext = createContext<ProjectFavoritesContextValue | null>(null);

export function ProjectFavoritesProvider({ children }: { children: ReactNode }) {
  const { organization, userId, isDevFallback } = useCurrentUser();
  const [favoriteSlugs, setFavoriteSlugs] = useState<Set<string>>(new Set());
  // Only the real fetch below (a genuine async operation) ever needs to
  // report "loading" — the dev-fallback/no-org/no-user case has nothing to
  // wait for, so it's derived directly below (`status`) rather than set
  // from the effect, which would otherwise be a synchronous setState-in-
  // effect for a value that's really just computable at render time.
  const [fetchStatus, setFetchStatus] = useState<ProjectFavoritesStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    // Dev-only fallback: no real organization/profile to persist favorites
    // against (never reached once a real organization exists — see
    // current-user-provider.tsx). Nothing to fetch; the star still renders,
    // it just can't be marked (toggleFavorite below no-ops for the same
    // reason).
    if (isDevFallback || !organization || !userId) return;

    const requestId = ++requestIdRef.current;
    loadFavoriteProjectSlugs(organization.id, userId).then((result) => {
      if (requestIdRef.current !== requestId) return; // superseded by a newer org/user
      if (result.status === "ready") setFavoriteSlugs(new Set(result.slugs));
      setFetchStatus("ready");
    });
    // organization?.id (not the object) — the object gets a new reference on
    // every window-focus regain (current-user-provider.tsx's own session
    // revalidation); favorites must not refetch just from switching tabs
    // and back, only on a real org/user change. Same reasoning already
    // documented in project-settings-screen.tsx/ticket-detail-screen.tsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDevFallback, organization?.id, userId]);

  const status: ProjectFavoritesStatus = isDevFallback || !organization || !userId ? "ready" : fetchStatus;

  const toggleFavorite = useCallback(
    (slug: string) => {
      if (isDevFallback || !organization || !userId) return;

      const wasFavorite = favoriteSlugs.has(slug);
      setFavoriteSlugs((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.delete(slug);
        else next.add(slug);
        return next;
      });

      const write = wasFavorite
        ? removeProjectFavorite(organization.id, userId, slug)
        : addProjectFavorite(organization.id, userId, slug);

      write.then((result) => {
        if (result.status !== "error") return;
        // Revert the optimistic flip and surface it — same shared toast
        // Ticket Detail/Project Settings/Notes already use for a failed
        // write, rather than a second/parallel error UI.
        setFavoriteSlugs((prev) => {
          const next = new Set(prev);
          if (wasFavorite) next.add(slug);
          else next.delete(slug);
          return next;
        });
        setErrorMessage(
          wasFavorite ? "Couldn't remove favorite. Please try again." : "Couldn't add favorite. Please try again."
        );
      });
    },
    [isDevFallback, organization, userId, favoriteSlugs]
  );

  return (
    <ProjectFavoritesContext.Provider value={{ status, favoriteSlugs, toggleFavorite }}>
      {children}
      {errorMessage && <ErrorToast message={errorMessage} onDismiss={() => setErrorMessage(null)} />}
    </ProjectFavoritesContext.Provider>
  );
}

export function useProjectFavorites(): ProjectFavoritesContextValue {
  const ctx = useContext(ProjectFavoritesContext);
  if (!ctx) throw new Error("useProjectFavorites must be used within a ProjectFavoritesProvider");
  return ctx;
}
