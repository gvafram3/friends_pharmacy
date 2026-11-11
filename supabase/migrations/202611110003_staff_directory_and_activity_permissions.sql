create or replace function public.get_organization_staff(p_actor_id uuid, p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org_id uuid;
begin
  select b.organization_id into v_org_id
  from public.branch_memberships m
  join public.branches b on b.id = m.branch_id and b.active
  join public.profiles actor on actor.id = m.user_id and actor.active
  where m.user_id = p_actor_id and m.branch_id = p_branch_id and m.role in ('owner', 'admin');
  if v_org_id is null then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'email', p.email,
      'full_name', p.full_name,
      'active', p.active,
      'roles', (
        select coalesce(jsonb_agg(distinct m.role order by m.role), '[]'::jsonb)
        from public.branch_memberships m
        join public.branches b on b.id = m.branch_id and b.active
        where m.user_id = p.id and b.organization_id = v_org_id
      ),
      'branches', (
        select coalesce(jsonb_agg(distinct b.name order by b.name), '[]'::jsonb)
        from public.branch_memberships m
        join public.branches b on b.id = m.branch_id and b.active
        where m.user_id = p.id and b.organization_id = v_org_id
      )
    ) order by nullif(trim(p.full_name), ''), p.email)
    from public.profiles p
    where exists (
      select 1 from public.branch_memberships m
      join public.branches b on b.id = m.branch_id and b.active
      where m.user_id = p.id and b.organization_id = v_org_id
    )
  ), '[]'::jsonb);
end;
$$;

create or replace function public.update_organization_staff_name(
  p_actor_id uuid, p_branch_id uuid, p_staff_user_id uuid, p_full_name text
) returns void language plpgsql security definer set search_path = public as $$
declare v_org_id uuid;
begin
  if length(trim(coalesce(p_full_name, ''))) not between 1 and 120 then
    raise exception 'Full name must be between 1 and 120 characters' using errcode = '22023';
  end if;

  select b.organization_id into v_org_id
  from public.branch_memberships m
  join public.branches b on b.id = m.branch_id and b.active
  join public.profiles actor on actor.id = m.user_id and actor.active
  where m.user_id = p_actor_id and m.branch_id = p_branch_id and m.role in ('owner', 'admin');
  if v_org_id is null then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.branch_memberships m
    join public.branches b on b.id = m.branch_id
    where m.user_id = p_staff_user_id and b.organization_id = v_org_id
  ) then
    raise exception 'Staff account not found in this organization' using errcode = 'P0002';
  end if;

  update public.profiles set full_name = trim(p_full_name) where id = p_staff_user_id;
  if not found then
    raise exception 'Staff account not found' using errcode = 'P0002';
  end if;
  insert into public.activity_log (organization_id, branch_id, user_id, event_type, details)
  values (v_org_id, p_branch_id, p_actor_id, 'staff_name_updated',
    jsonb_build_object('staff_user_id', p_staff_user_id));
end;
$$;

create or replace function public.get_branch_sales(p_user_id uuid, p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_role text;
begin
  select m.role into v_role from public.branch_memberships m
  join public.branches b on b.id = m.branch_id and b.active
  join public.profiles p on p.id = m.user_id and p.active
  where m.user_id = p_user_id and m.branch_id = p_branch_id;
  if v_role is null then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', s.id, 'no', s.receipt_number, 'at', coalesce(s.completed_at, s.created_at), 'pay', s.payment_method, 'status', s.status,
    'disc', s.discount_amount, 'total', s.total, 'tender', s.tendered,
    'sold_by', coalesce(nullif(trim(p.full_name), ''), p.email, 'Unknown staff'),
    'patient', case when v_role in ('owner', 'admin', 'manager') then s.patient_name else '' end,
    'prescriber', case when v_role in ('owner', 'admin', 'manager') then s.prescriber else '' end,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.product_name, 'qty', i.quantity,
      'price', i.unit_price,
      'cost', case when v_role in ('owner', 'admin', 'manager') then i.unit_cost else null end,
      'rx', i.prescription_only)) from public.sale_items i where i.sale_id = s.id), '[]'::jsonb)
  ) order by s.created_at desc) from (
    select * from public.sales where branch_id = p_branch_id order by created_at desc limit 500
  ) s left join public.profiles p on p.id = s.created_by), '[]'::jsonb);
end;
$$;

create or replace function public.get_branch_activity(p_user_id uuid, p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_role text;
begin
  select m.role into v_role from public.branch_memberships m
  join public.branches b on b.id = m.branch_id and b.active
  join public.profiles actor on actor.id = m.user_id and actor.active
  where m.user_id = p_user_id and m.branch_id = p_branch_id;
  if v_role is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'Manager or administrator access is required' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', a.id, 'at', a.created_at, 'type', a.event_type, 'message', a.details::text,
    'user_name', nullif(trim(p.full_name), ''),
    'user_email', p.email
  ) order by a.created_at desc) from (
      select * from public.activity_log where branch_id = p_branch_id order by created_at desc limit 500
    ) a left join public.profiles p on p.id = a.user_id), '[]'::jsonb);
end;
$$;

revoke all on function public.get_organization_staff(uuid, uuid) from public, anon, authenticated;
revoke all on function public.update_organization_staff_name(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.get_organization_staff(uuid, uuid) to service_role;
grant execute on function public.update_organization_staff_name(uuid, uuid, uuid, text) to service_role;
grant execute on function public.get_branch_sales(uuid, uuid) to service_role;
grant execute on function public.get_branch_activity(uuid, uuid) to service_role;
