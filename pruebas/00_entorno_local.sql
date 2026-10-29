drop database if exists citas;
create database citas;
\c citas
do $$ begin
 if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
do $$ begin if not exists (select from pg_roles where rolname='authenticator') then create role authenticator login password 'authpass' noinherit; end if; end $$;
grant anon, authenticated to authenticator;
create schema auth; create schema extensions;
create extension pgcrypto schema extensions;
grant usage on schema public, extensions, auth to anon, authenticated;
create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, email text unique,
 encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
 created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text, email_change text, email_change_token_new text);
create table auth.identities (id uuid primary key, user_id uuid references auth.users, provider_id text, identity_data jsonb, provider text,
 last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true),''), nullif(current_setting('request.jwt.claims', true),'')::json->>'sub')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
-- emulate supabase default grants
grant all on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
