do $bootstrap$
begin
  if not exists (select 1 from pg_roles where rolname = 'notify_migrator') then
    create role notify_migrator login password 'notify_local_migrator'
      connection limit -1 valid until 'infinity'
      nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  else
    alter role notify_migrator with login password 'notify_local_migrator'
      connection limit -1 valid until 'infinity'
      nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'notify_api') then
    create role notify_api login password 'notify_local_api'
      connection limit -1 valid until 'infinity'
      nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  else
    alter role notify_api with login password 'notify_local_api'
      connection limit -1 valid until 'infinity'
      nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'notify_monitor') then
    create role notify_monitor login password 'notify_local_monitor'
      connection limit -1 valid until 'infinity'
      nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  else
    alter role notify_monitor with login password 'notify_local_monitor'
      connection limit -1 valid until 'infinity'
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
        or granted_role.rolname in (
             'notify_migrator',
             'notify_api',
             'notify_monitor'
           )
  loop
    execute format(
      'revoke %I from %I granted by %I cascade',
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

do $database_privileges$
declare
  database_privilege text;
  privilege_grantee name;
  privilege_grantor name;
  grantee_is_public boolean;
begin
  for database_privilege, privilege_grantee, privilege_grantor, grantee_is_public in
    select
      privilege.privilege_type,
      grantee.rolname,
      grantor.rolname,
      privilege.grantee = 0
      from pg_database as database
      cross join lateral aclexplode(
        coalesce(database.datacl, acldefault('d', database.datdba))
      ) as privilege
      join pg_roles as grantor on grantor.oid = privilege.grantor
      left join pg_roles as grantee on grantee.oid = privilege.grantee
     where database.datname = 'notify'
       and (
         privilege.grantee = 0
         or grantee.rolname in ('notify_api', 'notify_monitor')
       )
  loop
    execute format('set local role %I', privilege_grantor);
    execute format(
      'revoke %s on database %I from %s granted by %I cascade',
      database_privilege,
      'notify',
      case
        when grantee_is_public then 'public'
        else format('%I', privilege_grantee)
      end,
      privilege_grantor
    );
    reset role;
  end loop;
end
$database_privileges$;

revoke all on database notify from public;
revoke all on database notify from notify_api, notify_monitor;
grant connect on database notify to notify_api, notify_monitor;

alter schema public owner to notify_migrator;

do $schema_privileges$
declare
  schema_privilege text;
  privilege_grantee name;
  privilege_grantor name;
  grantee_is_public boolean;
begin
  for schema_privilege, privilege_grantee, privilege_grantor, grantee_is_public in
    select
      privilege.privilege_type,
      grantee.rolname,
      grantor.rolname,
      privilege.grantee = 0
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) as privilege
      join pg_roles as grantor on grantor.oid = privilege.grantor
      left join pg_roles as grantee on grantee.oid = privilege.grantee
     where namespace.nspname = 'public'
       and (
         privilege.grantee = 0
         or grantee.rolname in ('notify_api', 'notify_monitor')
       )
  loop
    execute format('set local role %I', privilege_grantor);
    execute format(
      'revoke %s on schema public from %s granted by %I cascade',
      schema_privilege,
      case
        when grantee_is_public then 'public'
        else format('%I', privilege_grantee)
      end,
      privilege_grantor
    );
    reset role;
  end loop;
end
$schema_privileges$;

set role notify_migrator;
revoke all on schema public from public;
revoke all on schema public from notify_api, notify_monitor;
grant usage on schema public to notify_api, notify_monitor;
reset role;

alter default privileges for role notify_migrator
  revoke all on tables from public, notify_api, notify_monitor;
alter default privileges for role notify_migrator
  revoke all on sequences from public, notify_api, notify_monitor;
alter default privileges for role notify_migrator
  revoke execute on functions from public, notify_api, notify_monitor;
alter default privileges for role notify_migrator in schema public
  revoke all on tables from public, notify_api, notify_monitor;
alter default privileges for role notify_migrator in schema public
  revoke all on sequences from public, notify_api, notify_monitor;
alter default privileges for role notify_migrator in schema public
  revoke execute on functions from public, notify_api, notify_monitor;

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

do $function_privileges$
declare
  granted_function regprocedure;
  function_grantee name;
  function_grantor name;
  grantee_is_public boolean;
  grantor_needs_schema_usage boolean;
begin
  for granted_function, function_grantee, function_grantor, grantee_is_public in
    select
      procedure.oid::regprocedure,
      grantee.rolname,
      grantor.rolname,
      privilege.grantee = 0
      from pg_proc as procedure
      join pg_namespace as namespace on namespace.oid = procedure.pronamespace
      cross join lateral aclexplode(
        coalesce(procedure.proacl, acldefault('f', procedure.proowner))
      ) as privilege
      join pg_roles as grantor on grantor.oid = privilege.grantor
      left join pg_roles as grantee on grantee.oid = privilege.grantee
     where namespace.nspname = 'public'
       and privilege.privilege_type = 'EXECUTE'
       and (
         privilege.grantee = 0
         or (
           grantee.rolname in ('notify_api', 'notify_monitor')
           and exists (
             select 1
               from pg_depend as dependency
               join pg_extension as extension on extension.oid = dependency.refobjid
              where dependency.classid = 'pg_proc'::regclass
                and dependency.objid = procedure.oid
                and dependency.deptype = 'e'
                and extension.extname = 'pgcrypto'
           )
         )
       )
  loop
    grantor_needs_schema_usage := not has_schema_privilege(
      function_grantor,
      'public',
      'usage'
    );
    if grantor_needs_schema_usage then
      execute format(
        'grant usage on schema public to %I',
        function_grantor
      );
    end if;
    execute format('set local role %I', function_grantor);
    execute format(
      'revoke execute on routine %s from %s granted by %I cascade',
      granted_function,
      case
        when grantee_is_public then 'public'
        else format('%I', function_grantee)
      end,
      function_grantor
    );
    reset role;
    if grantor_needs_schema_usage then
      execute format(
        'revoke usage on schema public from %I',
        function_grantor
      );
    end if;
  end loop;
end
$function_privileges$;

revoke execute on all routines in schema public from public;
grant execute on function public.gen_random_uuid()
  to notify_migrator, notify_api, notify_monitor;
