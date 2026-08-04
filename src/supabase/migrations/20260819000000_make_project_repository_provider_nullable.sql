-- 1. Permitir NULL antes de intentar guardar NULL
alter table public.projects
  alter column repository_provider drop default,
  alter column repository_provider drop not null;

-- 2. Convertir el valor anterior "none" a NULL
update public.projects
set repository_provider = null
where repository_provider = 'none';

-- 3. Evitar recrear constraints si estás reintentando la migración
alter table public.projects
  drop constraint if exists projects_repository_provider_check;

alter table public.projects
  drop constraint if exists projects_repository_url_requires_provider;

-- 4. Aceptar únicamente github, gitlab o NULL
alter table public.projects
  add constraint projects_repository_provider_check
  check (
    repository_provider is null
    or repository_provider in ('github', 'gitlab')
  );

-- 5. Provider y URL deben existir o quedar vacíos conjuntamente
alter table public.projects
  add constraint projects_repository_url_requires_provider
  check (
    (repository_provider is null and repository_url is null)
    or
    (repository_provider is not null and repository_url is not null)
  );