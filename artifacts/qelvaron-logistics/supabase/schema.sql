-- Qelvaron Global Logistics
-- Run this whole file in Supabase SQL Editor before using /admin or /tracking.

create table if not exists public.qelvaron_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  tracking_number text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'Booked'
    check (status in ('Booked', 'Picked up', 'In transit', 'Stopover', 'Held by Customs', 'Out for delivery', 'Delayed', 'Delivered', 'Exception', 'Failed delivery')),
  mode text not null default 'Air'
    check (mode in ('Air', 'Road', 'Sea', 'Rail')),
  carrier text not null default '',
  sender_name text not null default '',
  sender_email text not null default '',
  sender_phone text not null default '',
  origin_street text not null default '',
  origin_city text not null default '',
  origin_region text not null default '',
  origin_postal text not null default '',
  origin_country text not null default '',
  recipient_name text not null default '',
  recipient_email text not null default '',
  recipient_phone text not null default '',
  destination_street text not null default '',
  destination_city text not null default '',
  destination_region text not null default '',
  destination_postal text not null default '',
  destination_country text not null default '',
  cargo text not null default '',
  package_count integer not null default 1 check (package_count > 0),
  weight text not null default '',
  dimensions text not null default '',
  pickup_date date,
  estimated_delivery date,
  custom_fee numeric(12, 2) not null default 0 check (custom_fee >= 0),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  payment_method text not null default '',
  payment_reference text not null default '',
  payment_status text not null default 'Pending'
    check (payment_status in ('Pending', 'Partial', 'Paid', 'Overdue')),
  notes text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.shipments
  add column if not exists custom_fee numeric(12, 2) not null default 0
  check (custom_fee >= 0);

create table if not exists public.tracking_updates (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  status text not null
    check (status in ('Booked', 'Picked up', 'In transit', 'Stopover', 'Held by Customs', 'Out for delivery', 'Delayed', 'Delivered', 'Exception', 'Failed delivery')),
  location text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create table if not exists public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.shipments (id) on delete set null,
  tracking_reference text not null default '',
  recipient text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null
);

create index if not exists shipments_created_at_idx
  on public.shipments (created_at desc);
create index if not exists shipments_status_idx
  on public.shipments (status);
create index if not exists tracking_updates_shipment_created_idx
  on public.tracking_updates (shipment_id, created_at desc);
create index if not exists email_drafts_updated_at_idx
  on public.email_drafts (updated_at desc);

create or replace function public.is_qelvaron_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.qelvaron_admins as admins
    where admins.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_qelvaron_admin() from public;
grant execute on function public.is_qelvaron_admin() to authenticated;

create or replace function public.set_shipment_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  candidate text;
begin
  if coalesce(pg_catalog.btrim(new.tracking_number), '') = '' then
    loop
      candidate :=
        'QGL-' ||
        pg_catalog.to_char(pg_catalog.now(), 'YYMMDD') ||
        '-' ||
        pg_catalog.upper(
          pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
        );
      exit when not exists (
        select 1
        from public.shipments as existing
        where existing.tracking_number = candidate
      );
    end loop;
    new.tracking_number := candidate;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  end if;
  new.updated_by := (select auth.uid());
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists shipments_set_defaults on public.shipments;
create trigger shipments_set_defaults
before insert or update on public.shipments
for each row execute function public.set_shipment_defaults();

create or replace function public.set_email_draft_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  end if;
  new.updated_by := (select auth.uid());
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists email_drafts_set_defaults on public.email_drafts;
create trigger email_drafts_set_defaults
before insert or update on public.email_drafts
for each row execute function public.set_email_draft_defaults();

create or replace function public.record_tracking_update(
  p_shipment_id uuid,
  p_status text,
  p_location text,
  p_description text default ''
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_update_id uuid;
begin
  if not public.is_qelvaron_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  update public.shipments
  set status = p_status
  where id = p_shipment_id;

  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  insert into public.tracking_updates (
    shipment_id,
    status,
    location,
    description,
    created_by
  )
  values (
    p_shipment_id,
    p_status,
    pg_catalog.btrim(p_location),
    coalesce(p_description, ''),
    (select auth.uid())
  )
  returning id into new_update_id;

  return new_update_id;
end;
$$;

revoke all on function public.record_tracking_update(uuid, text, text, text) from public;
grant execute on function public.record_tracking_update(uuid, text, text, text) to authenticated;

create or replace function public.lookup_shipment(p_reference text)
returns table (
  tracking_number text,
  status text,
  mode text,
  carrier text,
  origin_city text,
  origin_country text,
  destination_city text,
  destination_country text,
  created_at timestamptz,
  pickup_date date,
  estimated_delivery date,
  updates jsonb
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select
    shipment.tracking_number,
    shipment.status,
    shipment.mode,
    shipment.carrier,
    shipment.origin_city,
    shipment.origin_country,
    shipment.destination_city,
    shipment.destination_country,
    shipment.created_at,
    shipment.pickup_date,
    shipment.estimated_delivery,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'status', tracking_event.status,
            'location', tracking_event.location,
            'description', tracking_event.description,
            'timestamp', tracking_event.created_at
          )
          order by tracking_event.created_at desc
        )
        from public.tracking_updates as tracking_event
        where tracking_event.shipment_id = shipment.id
      ),
      '[]'::jsonb
    ) as updates
  from public.shipments as shipment
  where pg_catalog.length(pg_catalog.btrim(p_reference)) <= 50
    and shipment.tracking_number = pg_catalog.upper(pg_catalog.btrim(p_reference))
  limit 1;
$$;

revoke all on function public.lookup_shipment(text) from public;
grant execute on function public.lookup_shipment(text) to anon, authenticated;

alter table public.qelvaron_admins enable row level security;
alter table public.shipments enable row level security;
alter table public.tracking_updates enable row level security;
alter table public.email_drafts enable row level security;

revoke all on table public.qelvaron_admins from public, anon, authenticated;
revoke all on table public.shipments, public.tracking_updates, public.email_drafts
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.shipments, public.tracking_updates, public.email_drafts
  to authenticated;

drop policy if exists "Qelvaron admins manage shipments" on public.shipments;
create policy "Qelvaron admins manage shipments"
  on public.shipments for all to authenticated
  using ((select public.is_qelvaron_admin()))
  with check ((select public.is_qelvaron_admin()));

drop policy if exists "Qelvaron admins manage tracking updates" on public.tracking_updates;
create policy "Qelvaron admins manage tracking updates"
  on public.tracking_updates for all to authenticated
  using ((select public.is_qelvaron_admin()))
  with check ((select public.is_qelvaron_admin()));

drop policy if exists "Qelvaron admins manage email drafts" on public.email_drafts;
create policy "Qelvaron admins manage email drafts"
  on public.email_drafts for all to authenticated
  using ((select public.is_qelvaron_admin()))
  with check ((select public.is_qelvaron_admin()));
