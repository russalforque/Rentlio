-- =============================================================================
-- Bed types and the beds in each room.
-- The landlord maintains the list of bed types (seeded with common ones that can
-- be renamed or removed) and records how many of each type a room has.
-- =============================================================================

create table public.bed_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index bed_types_name_key on public.bed_types (lower(btrim(name)));

create trigger bed_types_updated_at before update on public.bed_types
  for each row execute function public.set_updated_at();

insert into public.bed_types (name) values ('Single bed'), ('Double deck'), ('Double bed');

create table public.room_beds (
  room_id      uuid not null references public.rooms (id) on delete cascade,
  -- A bed type still used by a room cannot be removed.
  bed_type_id  uuid not null references public.bed_types (id) on delete restrict,
  quantity     smallint not null check (quantity between 1 and 20),
  primary key (room_id, bed_type_id)
);
create index room_beds_bed_type_idx on public.room_beds (bed_type_id);

-- Replaces a room's beds in one step. p_beds: [{ "bed_type_id": uuid, "quantity": int }]
create function public.set_room_beds(p_room_id uuid, p_beds jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._assert_landlord();

  if not exists (select 1 from public.rooms where id = p_room_id) then
    raise exception 'Room not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(coalesce(p_beds, '[]'::jsonb)) <> 'array' then
    raise exception 'Beds must be a list' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_beds, '[]'::jsonb)) b
    group by b ->> 'bed_type_id' having count(*) > 1
  ) then
    raise exception 'Each bed type can only be listed once per room' using errcode = '22023';
  end if;

  delete from public.room_beds where room_id = p_room_id;

  insert into public.room_beds (room_id, bed_type_id, quantity)
  select p_room_id, (b ->> 'bed_type_id')::uuid, (b ->> 'quantity')::smallint
  from jsonb_array_elements(coalesce(p_beds, '[]'::jsonb)) b;
end;
$$;

-- Privileges: bed types are edited directly by the landlord (RLS); room beds are
-- written only through set_room_beds.
revoke all on public.bed_types, public.room_beds from anon, authenticated;
grant select on public.bed_types, public.room_beds to authenticated;
grant insert, update, delete on public.bed_types to authenticated;

revoke execute on function public.set_room_beds(uuid, jsonb) from public, anon;
grant execute on function public.set_room_beds(uuid, jsonb) to authenticated;

alter table public.bed_types enable row level security;
alter table public.room_beds enable row level security;

create policy "bed_types: everyone reads"
  on public.bed_types for select to authenticated
  using (true);

create policy "bed_types: landlord inserts"
  on public.bed_types for insert to authenticated
  with check ((select public.is_landlord()));

create policy "bed_types: landlord updates"
  on public.bed_types for update to authenticated
  using ((select public.is_landlord()))
  with check ((select public.is_landlord()));

create policy "bed_types: landlord deletes"
  on public.bed_types for delete to authenticated
  using ((select public.is_landlord()));

create policy "room_beds: landlord reads all, tenant reads own rooms"
  on public.room_beds for select to authenticated
  using (
    (select public.is_landlord())
    or exists (
      select 1 from public.leases l
      where l.room_id = room_beds.room_id and l.tenant_id = (select auth.uid())
    )
  );
