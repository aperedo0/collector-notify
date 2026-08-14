do $bootstrap$
begin
  if not exists (select 1 from pg_roles where rolname = 'notify_migrator') then
    create role notify_migrator login password 'notify_local_migrator'
      nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  else
    alter role notify_migrator with login password 'notify_local_migrator'
      nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'notify_api') then
    create role notify_api login password 'notify_local_api'
      nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  else
    alter role notify_api with login password 'notify_local_api'
      nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'notify_monitor') then
    create role notify_monitor login password 'notify_local_monitor'
      nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  else
    alter role notify_monitor with login password 'notify_local_monitor'
      nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  end if;
end
$bootstrap$;

do $runtime_role_memberships$
declare
  runtime_role_name name;
  granted_role_name name;
  membership_grantor_name name;
begin
  for runtime_role_name, granted_role_name, membership_grantor_name in
    select
      member_role.rolname,
      granted_role.rolname,
      membership_grantor.rolname
      from pg_auth_members as membership
      join pg_roles as granted_role on granted_role.oid = membership.roleid
      join pg_roles as member_role on member_role.oid = membership.member
      join pg_roles as membership_grantor
        on membership_grantor.oid = membership.grantor
     where member_role.rolname in (
       'notify_migrator',
       'notify_api',
       'notify_monitor'
     )
  loop
    execute format(
      'revoke %I from %I granted by %I',
      granted_role_name,
      runtime_role_name,
      membership_grantor_name
    );
  end loop;
end
$runtime_role_memberships$;

alter default privileges for role notify_bootstrap
  revoke execute on functions from public;

alter database notify owner to notify_migrator;
revoke all on database notify from public;
revoke all on database notify from notify_api, notify_monitor;
grant connect on database notify to notify_api, notify_monitor;

set role notify_migrator;
create extension if not exists pgcrypto with schema public;
reset role;

do $extension_ownership$
declare
  member_function regprocedure;
begin
  for member_function in
    select procedure.oid::regprocedure
      from pg_proc as procedure
      join pg_depend as dependency
        on dependency.classid = 'pg_proc'::regclass
       and dependency.objid = procedure.oid
       and dependency.deptype = 'e'
      join pg_extension as extension
        on extension.oid = dependency.refobjid
     where extension.extname = 'pgcrypto'
  loop
    execute format(
      'alter function %s owner to notify_migrator',
      member_function
    );
  end loop;
end
$extension_ownership$;

revoke execute on all functions in schema public from public;
grant execute on function public.gen_random_uuid()
  to notify_migrator, notify_api, notify_monitor;
