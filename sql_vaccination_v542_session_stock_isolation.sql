-- ============================================================================
-- V542 — VACCINATION SESSION STOCK ISOLATION
-- Scope: Vaccination ONLY
-- HARD ZERO TOUCH: vaccination_sessions.existing_flow_config / dokter / antrean /
--                  registrasi flow, CAPASKA, MCU Corporate, Wellness.
--
-- TUJUAN
-- 1) Lot Number yang sama boleh dimiliki Session berbeda dengan stok independen.
-- 2) Duplikat Katalog hanya membawa product + Lot Number; stok tidak ikut.
-- 3) Repair legacy catalog allocation yang masih menunjuk Lot milik Session lain.
-- 4) Repair audit V541 Alsut vs Simprug yang terbukti salah routing.
--
-- SAFE / IDEMPOTENT / TRANSACTIONAL.
-- Jika baseline data audit V541 sudah berubah secara tidak dikenal, SQL berhenti.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- A. OWNER-SCOPED LOT UNIQUENESS
-- Legacy Phase 1 memakai UNIQUE(vaccine_id, lot_number), sehingga Lot Number
-- yang sama tidak bisa dimiliki dua Session berbeda. Hapus hanya constraint
-- legacy exact tersebut, lalu ganti dengan uniqueness berbasis owner stok.
-- --------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.vaccination_vaccine_lots'::regclass
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) = 'UNIQUE (vaccine_id, lot_number)'
  loop
    execute format(
      'alter table public.vaccination_vaccine_lots drop constraint %I',
      r.conname
    );
  end loop;
end $$;

drop index if exists public.ux_vaccination_vaccine_lots_owner_lot_v542;
create unique index ux_vaccination_vaccine_lots_owner_lot_v542
  on public.vaccination_vaccine_lots (
    vaccine_id,
    lower(btrim(lot_number)),
    upper(coalesce(nullif(btrim(stock_scope), ''), 'GENERAL')),
    case
      when upper(coalesce(nullif(btrim(stock_scope), ''), 'GENERAL')) = 'COMPANY'
        then lower(coalesce(nullif(btrim(stock_company_name), ''), ''))
      else ''
    end,
    case
      when upper(coalesce(nullif(btrim(stock_scope), ''), 'GENERAL')) = 'SESSION'
        then coalesce(stock_session_id, 0)
      else 0
    end
  );

comment on index public.ux_vaccination_vaccine_lots_owner_lot_v542 is
  'V542: same vaccine + Lot Number may exist for different stock owners; uniqueness stays strict inside one owner/session.';

-- --------------------------------------------------------------------------
-- B. GENERAL LEGACY CATALOG REPAIR
-- Repair only rows explicitly marked "Catalog only from Session ..." whose
-- allocation Session differs from SESSION-owner of the referenced Lot.
-- allocated_qty MUST be 0; non-zero mismatch is safety-stopped.
-- --------------------------------------------------------------------------
do $$
declare
  r record;
  v_target_company text;
  v_target_lot_id bigint;
  v_existing_alloc_id bigint;
  sv record;
begin
  for r in
    select
      a.id as allocation_id,
      a.session_id as target_session_id,
      a.vaccine_id,
      a.lot_id as source_lot_id,
      a.service_mode,
      coalesce(a.allocated_qty, 0) as allocated_qty,
      l.lot_number,
      l.expiry_date,
      l.stock_session_id as source_owner_session_id,
      l.stock_scope
    from public.vaccination_session_stock_allocations a
    join public.vaccination_vaccine_lots l on l.id = a.lot_id
    where a.active = true
      and coalesce(a.notes, '') ilike 'Catalog only from Session %'
      and upper(coalesce(l.stock_scope, 'GENERAL')) = 'SESSION'
      and l.stock_session_id is not null
      and a.session_id <> l.stock_session_id
  loop
    if r.allocated_qty <> 0 then
      raise exception
        'V542 safety stop: catalog allocation % points across Session with allocated_qty=% (must be 0).',
        r.allocation_id, r.allocated_qty;
    end if;

    select s.company_name
      into v_target_company
    from public.vaccination_sessions s
    where s.id = r.target_session_id;

    if nullif(btrim(coalesce(v_target_company, '')), '') is null then
      raise exception 'V542 safety stop: target Session % has no company_name.', r.target_session_id;
    end if;

    select l.id
      into v_target_lot_id
    from public.vaccination_vaccine_lots l
    where l.vaccine_id = r.vaccine_id
      and lower(btrim(l.lot_number)) = lower(btrim(r.lot_number))
      and upper(coalesce(l.stock_scope, 'GENERAL')) = 'SESSION'
      and l.stock_session_id = r.target_session_id
    order by l.id
    limit 1;

    if v_target_lot_id is null then
      insert into public.vaccination_vaccine_lots (
        vaccine_id,
        lot_number,
        expiry_date,
        stock_initial,
        stock_added,
        stock_used,
        stock_physical_count,
        inventory_notes,
        stock_scope,
        stock_company_name,
        stock_session_id,
        active,
        created_at,
        updated_at
      ) values (
        r.vaccine_id,
        r.lot_number,
        r.expiry_date,
        0,
        0,
        0,
        null,
        format('V542 catalog clone from Session %s; stock not copied', r.source_owner_session_id),
        'SESSION',
        v_target_company,
        r.target_session_id,
        true,
        now(),
        now()
      )
      returning id into v_target_lot_id;
    end if;

    select a2.id
      into v_existing_alloc_id
    from public.vaccination_session_stock_allocations a2
    where a2.session_id = r.target_session_id
      and a2.lot_id = v_target_lot_id
      and upper(coalesce(a2.service_mode, 'HEALTHDAY')) = upper(coalesce(r.service_mode, 'HEALTHDAY'))
      and a2.id <> r.allocation_id
    order by a2.id
    limit 1;

    if v_existing_alloc_id is null then
      update public.vaccination_session_stock_allocations
      set lot_id = v_target_lot_id,
          notes = format('Catalog only from Session %s; stock not copied; isolated by V542', r.source_owner_session_id),
          updated_at = now()
      where id = r.allocation_id;
    else
      -- Existing target-owned allocation wins. Never overwrite its quantity.
      update public.vaccination_session_stock_allocations
      set active = false,
          notes = coalesce(notes, '') || ' | V542 disabled legacy cross-session catalog link',
          updated_at = now()
      where id = r.allocation_id;
    end if;

    for sv in
      select id, dose_number, active
      from public.vaccination_session_vaccines
      where session_id = r.target_session_id
        and vaccine_id = r.vaccine_id
        and lot_id = r.source_lot_id
    loop
      insert into public.vaccination_session_vaccines (
        session_id, vaccine_id, lot_id, dose_number, active, created_at, updated_at
      ) values (
        r.target_session_id, r.vaccine_id, v_target_lot_id,
        coalesce(sv.dose_number, 1), coalesce(sv.active, true), now(), now()
      )
      on conflict (session_id, vaccine_id, lot_id, dose_number)
      do update set active = excluded.active, updated_at = now();

      delete from public.vaccination_session_vaccines where id = sv.id;
    end loop;

    v_target_lot_id := null;
    v_existing_alloc_id := null;
  end loop;
end $$;

-- --------------------------------------------------------------------------
-- C. V541 GUARDED REPAIR — ALSUT (177) vs SIMPRUG (179)
-- Audit V541 proved:
--   * User input initial=3 intended for Alsut routed to Simprug for products 34/39.
--   * Alsut still held old planned values 10/5, not actual stock.
--   * Simprug Gardasil 34 had prior Portal Inventory +10 that V540 edit reduced to 0.
-- This block is intentionally strict and idempotent.
-- --------------------------------------------------------------------------
do $$
declare
  v_alsut_name text;
  v_simprug_name text;
  v_company_alsut text;
  v_company_simprug text;
  v_g34 public.vaccination_vaccine_lots%rowtype;
  v_f39 public.vaccination_vaccine_lots%rowtype;
  v_alsut_g34_lot bigint;
  v_alsut_f39_lot bigint;
  v_portal_g34_added integer;
  v_post_repair boolean := false;
  v_refs integer;
begin
  select session_name, company_name into v_alsut_name, v_company_alsut
  from public.vaccination_sessions where id = 177;
  select session_name, company_name into v_simprug_name, v_company_simprug
  from public.vaccination_sessions where id = 179;

  if v_alsut_name is null or v_simprug_name is null
     or v_alsut_name not ilike '%Alam Sutera%'
     or v_simprug_name not ilike '%Simprug%'
     or lower(btrim(coalesce(v_company_alsut,''))) <> lower(btrim(coalesce(v_company_simprug,''))) then
    raise exception 'V542 safety stop: Session 177/179 identity no longer matches V541 audit.';
  end if;

  select l.* into v_g34
  from public.vaccination_vaccine_lots l
  where l.id = 34 and l.vaccine_id = 34 and l.lot_number = 'A003509';

  select l.* into v_f39
  from public.vaccination_vaccine_lots l
  where l.id = 39 and l.vaccine_id = 39 and l.lot_number = 'E3202409015';

  if v_g34.id is null or v_f39.id is null then
    raise exception 'V542 safety stop: V541 source Lot IDs 34/39 no longer match.';
  end if;

  select
    (select count(*) from public.vaccination_records r where r.lot_id in (34,39))
    +
    (select count(*) from public.vaccination_registration_items i where i.lot_id in (34,39) and coalesce(i.active,true) = true)
    into v_refs;
  if v_refs <> 0 then
    raise exception 'V542 safety stop: misrouted source Lots 34/39 already have operational record/item references (%).', v_refs;
  end if;

  select coalesce(sum(greatest(coalesce(m.qty,0),0)),0)::integer
    into v_portal_g34_added
  from public.vaccination_inventory_movements m
  where m.lot_id = 34
    and m.reference_type = 'public_inventory_system'
    and m.movement_type = 'stock_in';

  -- Detect already repaired state first (idempotent re-run).
  select l.id into v_alsut_g34_lot
  from public.vaccination_vaccine_lots l
  where l.vaccine_id = 34
    and lower(btrim(l.lot_number)) = lower('A003509')
    and upper(coalesce(l.stock_scope,'GENERAL')) = 'SESSION'
    and l.stock_session_id = 177
  order by l.id limit 1;

  select l.id into v_alsut_f39_lot
  from public.vaccination_vaccine_lots l
  where l.vaccine_id = 39
    and lower(btrim(l.lot_number)) = lower('E3202409015')
    and upper(coalesce(l.stock_scope,'GENERAL')) = 'SESSION'
    and l.stock_session_id = 177
  order by l.id limit 1;

  if v_alsut_g34_lot is not null and v_alsut_f39_lot is not null
     and coalesce(v_g34.stock_initial,0) = 0
     and coalesce(v_g34.stock_added,0) = v_portal_g34_added
     and coalesce(v_f39.stock_initial,0) = 0
     and coalesce(v_f39.stock_added,0) = 0 then
    v_post_repair := true;
  end if;

  if not v_post_repair then
    -- Strict pre-repair snapshot guards from V541.
    if upper(coalesce(v_g34.stock_scope,'GENERAL')) <> 'SESSION'
       or coalesce(v_g34.stock_session_id,0) <> 179
       or coalesce(v_g34.stock_initial,0) <> 3
       or coalesce(v_g34.stock_added,0) <> 0
       or coalesce(v_g34.stock_used,0) <> 0 then
      raise exception 'V542 safety stop: Gardasil Lot 34 diverged from V541 snapshot.';
    end if;

    if upper(coalesce(v_f39.stock_scope,'GENERAL')) <> 'SESSION'
       or coalesce(v_f39.stock_session_id,0) <> 179
       or coalesce(v_f39.stock_initial,0) <> 3
       or coalesce(v_f39.stock_added,0) <> 0
       or coalesce(v_f39.stock_used,0) <> 0 then
      raise exception 'V542 safety stop: Formening Lot 39 diverged from V541 snapshot.';
    end if;

    if v_portal_g34_added <> 10 then
      raise exception 'V542 safety stop: expected Simprug Gardasil Portal Inventory historical +10, found %.', v_portal_g34_added;
    end if;

    if not exists (
      select 1 from public.vaccination_session_product_assignments
      where session_id = 177 and vaccine_id = 34 and service_mode = 'BAZAR'
        and active = true and planned_stock_initial = 10
    ) then
      raise exception 'V542 safety stop: Alsut Gardasil planned_stock_initial is no longer 10.';
    end if;

    if not exists (
      select 1 from public.vaccination_session_product_assignments
      where session_id = 177 and vaccine_id = 39 and service_mode = 'BAZAR'
        and active = true and planned_stock_initial = 5
    ) then
      raise exception 'V542 safety stop: Alsut Formening planned_stock_initial is no longer 5.';
    end if;

    -- Create/reuse exact Alsut-owned Lot 34 clone; target stock is user-intended 3.
    if v_alsut_g34_lot is null then
      insert into public.vaccination_vaccine_lots (
        vaccine_id, lot_number, expiry_date,
        stock_initial, stock_added, stock_used,
        stock_physical_count, inventory_notes,
        stock_scope, stock_company_name, stock_session_id,
        active, created_at, updated_at
      ) values (
        34, v_g34.lot_number, v_g34.expiry_date,
        3, 0, 0,
        null, 'V542 repair: user initial 3 routed to Alsut from V541 audit',
        'SESSION', v_company_alsut, 177,
        true, now(), now()
      ) returning id into v_alsut_g34_lot;

      insert into public.vaccination_inventory_movements (
        vaccine_id, lot_id, movement_type, qty,
        reference_type, reference_id, notes, created_by, created_at
      ) values (
        34, v_alsut_g34_lot, 'initial', 3,
        'migration_v542', v_alsut_g34_lot,
        'V542 repair: initial 3 belongs to BINUS Alam Sutera Campus',
        'migration_v542', now()
      );
    else
      if exists (
        select 1 from public.vaccination_vaccine_lots
        where id = v_alsut_g34_lot
          and (coalesce(stock_initial,0) <> 0 or coalesce(stock_added,0) <> 0 or coalesce(stock_used,0) <> 0)
      ) then
        raise exception 'V542 safety stop: an Alsut Gardasil target Lot already exists with stock; refusing overwrite.';
      end if;
      update public.vaccination_vaccine_lots
      set stock_initial = 3,
          inventory_notes = 'V542 repair: user initial 3 routed to Alsut from V541 audit',
          updated_at = now()
      where id = v_alsut_g34_lot;
      insert into public.vaccination_inventory_movements (
        vaccine_id, lot_id, movement_type, qty,
        reference_type, reference_id, notes, created_by, created_at
      ) values (
        34, v_alsut_g34_lot, 'initial', 3,
        'migration_v542', v_alsut_g34_lot,
        'V542 repair: initial 3 belongs to BINUS Alam Sutera Campus',
        'migration_v542', now()
      );
    end if;

    -- Create/reuse exact Alsut-owned Lot 39 clone; target stock is user-intended 3.
    if v_alsut_f39_lot is null then
      insert into public.vaccination_vaccine_lots (
        vaccine_id, lot_number, expiry_date,
        stock_initial, stock_added, stock_used,
        stock_physical_count, inventory_notes,
        stock_scope, stock_company_name, stock_session_id,
        active, created_at, updated_at
      ) values (
        39, v_f39.lot_number, v_f39.expiry_date,
        3, 0, 0,
        null, 'V542 repair: user initial 3 routed to Alsut from V541 audit',
        'SESSION', v_company_alsut, 177,
        true, now(), now()
      ) returning id into v_alsut_f39_lot;

      insert into public.vaccination_inventory_movements (
        vaccine_id, lot_id, movement_type, qty,
        reference_type, reference_id, notes, created_by, created_at
      ) values (
        39, v_alsut_f39_lot, 'initial', 3,
        'migration_v542', v_alsut_f39_lot,
        'V542 repair: initial 3 belongs to BINUS Alam Sutera Campus',
        'migration_v542', now()
      );
    else
      if exists (
        select 1 from public.vaccination_vaccine_lots
        where id = v_alsut_f39_lot
          and (coalesce(stock_initial,0) <> 0 or coalesce(stock_added,0) <> 0 or coalesce(stock_used,0) <> 0)
      ) then
        raise exception 'V542 safety stop: an Alsut Formening target Lot already exists with stock; refusing overwrite.';
      end if;
      update public.vaccination_vaccine_lots
      set stock_initial = 3,
          inventory_notes = 'V542 repair: user initial 3 routed to Alsut from V541 audit',
          updated_at = now()
      where id = v_alsut_f39_lot;
      insert into public.vaccination_inventory_movements (
        vaccine_id, lot_id, movement_type, qty,
        reference_type, reference_id, notes, created_by, created_at
      ) values (
        39, v_alsut_f39_lot, 'initial', 3,
        'migration_v542', v_alsut_f39_lot,
        'V542 repair: initial 3 belongs to BINUS Alam Sutera Campus',
        'migration_v542', now()
      );
    end if;

    -- Planned values 10/5 were old pre-Lot metadata. Once exact Alsut Lots exist,
    -- set planned to zero so UI reads actual isolated stock instead of stale plans.
    update public.vaccination_session_product_assignments
    set planned_stock_initial = 0, updated_at = now()
    where session_id = 177
      and service_mode = 'BAZAR'
      and vaccine_id in (34,39);

    -- Alsut service allocations: exact isolated Lot, BAZAR 3 each.
    insert into public.vaccination_session_stock_allocations (
      session_id, vaccine_id, lot_id, allocated_qty,
      low_stock_threshold, dedicated, active, service_mode,
      notes, created_by, created_at, updated_at
    ) values
      (177, 34, v_alsut_g34_lot, 3, 3, true, true, 'BAZAR', 'V542 isolated Alsut stock', 'migration_v542', now(), now()),
      (177, 39, v_alsut_f39_lot, 3, 3, true, true, 'BAZAR', 'V542 isolated Alsut stock', 'migration_v542', now(), now())
    on conflict (session_id, lot_id, service_mode)
    do update set
      allocated_qty = excluded.allocated_qty,
      active = true,
      notes = excluded.notes,
      updated_at = now();

    insert into public.vaccination_session_vaccines (
      session_id, vaccine_id, lot_id, dose_number, active, created_at, updated_at
    ) values
      (177, 34, v_alsut_g34_lot, 1, true, now(), now()),
      (177, 39, v_alsut_f39_lot, 1, true, now(), now())
    on conflict (session_id, vaccine_id, lot_id, dose_number)
    do update set active = true, updated_at = now();

    -- Restore Simprug source state from V541 movement history.
    -- Gardasil: remove wrong initial 3, restore historical Portal +10 as stock_added.
    update public.vaccination_vaccine_lots
    set stock_initial = 0,
        stock_added = v_portal_g34_added,
        inventory_notes = coalesce(inventory_notes, '') || ' | V542 repaired misrouted Alsut edit; restored Simprug Portal +10',
        updated_at = now()
    where id = 34;

    insert into public.vaccination_inventory_movements (
      vaccine_id, lot_id, movement_type, qty,
      reference_type, reference_id, notes, created_by, created_at
    ) values
      (34, 34, 'adjustment_out', -3, 'migration_v542', 34,
       'V542 repair: remove initial 3 misrouted from Alsut', 'migration_v542', now()),
      (34, 34, 'stock_in', v_portal_g34_added, 'migration_v542', 34,
       'V542 repair: restore Simprug Portal Inventory +10 removed by wrong edit', 'migration_v542', now());

    -- Formening Simprug: wrong initial 3 belonged to Alsut; Simprug remains catalog-only 0.
    update public.vaccination_vaccine_lots
    set stock_initial = 0,
        stock_added = 0,
        inventory_notes = coalesce(inventory_notes, '') || ' | V542 repaired misrouted Alsut edit; Simprug catalog-only 0',
        updated_at = now()
    where id = 39;

    insert into public.vaccination_inventory_movements (
      vaccine_id, lot_id, movement_type, qty,
      reference_type, reference_id, notes, created_by, created_at
    ) values (
      39, 39, 'adjustment_out', -3, 'migration_v542', 39,
      'V542 repair: remove initial 3 misrouted from Alsut', 'migration_v542', now()
    );

    -- Preserve service classification but correct quantities in Simprug.
    insert into public.vaccination_session_stock_allocations (
      session_id, vaccine_id, lot_id, allocated_qty,
      low_stock_threshold, dedicated, active, service_mode,
      notes, created_by, created_at, updated_at
    ) values
      (179, 34, 34, v_portal_g34_added, 3, true, true, 'BAZAR',
       'V542 restored Simprug Gardasil stock from Portal Inventory history', 'migration_v542', now(), now()),
      (179, 39, 39, 0, 3, true, true, 'BAZAR',
       'V542 Simprug Formening catalog-only; stock not copied', 'migration_v542', now(), now())
    on conflict (session_id, lot_id, service_mode)
    do update set
      allocated_qty = excluded.allocated_qty,
      active = true,
      notes = excluded.notes,
      updated_at = now();
  end if;
end $$;

-- --------------------------------------------------------------------------
-- D. FINAL SAFETY VERIFICATION
-- No active Session allocation may point to a SESSION-owned Lot of another
-- Session after V542.
-- --------------------------------------------------------------------------
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from public.vaccination_session_stock_allocations a
  join public.vaccination_vaccine_lots l on l.id = a.lot_id
  where a.active = true
    and upper(coalesce(l.stock_scope,'GENERAL')) = 'SESSION'
    and l.stock_session_id is not null
    and a.session_id <> l.stock_session_id;

  if v_bad <> 0 then
    raise exception 'V542 final safety stop: % active allocations still point to another Session owner.', v_bad;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;

-- ============================================================================
-- READ-ONLY VERIFICATION OUTPUT
-- ============================================================================
select
  s.id as session_id,
  s.location,
  s.session_date,
  v.id as vaccine_id,
  v.name as product,
  l.id as lot_id,
  l.lot_number,
  l.stock_session_id as lot_owner_session_id,
  l.stock_initial,
  l.stock_added,
  l.stock_used,
  a.service_mode,
  a.allocated_qty,
  a.active as allocation_active
from public.vaccination_session_stock_allocations a
join public.vaccination_sessions s on s.id = a.session_id
join public.vaccination_vaccines v on v.id = a.vaccine_id
join public.vaccination_vaccine_lots l on l.id = a.lot_id
where a.session_id in (177,179)
  and a.vaccine_id in (23,34,39)
order by s.id, v.id, l.id, a.service_mode;

select
  session_id,
  vaccine_id,
  service_mode,
  planned_stock_initial,
  active
from public.vaccination_session_product_assignments
where session_id in (177,179)
  and vaccine_id in (34,39)
order by session_id, vaccine_id, service_mode;

select
  count(*) as active_cross_session_allocation_mismatch_should_be_zero
from public.vaccination_session_stock_allocations a
join public.vaccination_vaccine_lots l on l.id = a.lot_id
where a.active = true
  and upper(coalesce(l.stock_scope,'GENERAL')) = 'SESSION'
  and l.stock_session_id is not null
  and a.session_id <> l.stock_session_id;


select
  count(*) as active_session_vaccine_cross_owner_links_review
from public.vaccination_session_vaccines sv
join public.vaccination_vaccine_lots l on l.id = sv.lot_id
where sv.active = true
  and upper(coalesce(l.stock_scope,'GENERAL')) = 'SESSION'
  and l.stock_session_id is not null
  and sv.session_id <> l.stock_session_id;
