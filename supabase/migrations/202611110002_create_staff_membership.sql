create or replace function public.create_staff_membership(
  p_actor_id uuid, p_new_user_id uuid, p_branch_ids uuid[], p_role text
) returns void language plpgsql security definer set search_path = public as $$
declare v_branch_id uuid; v_org_id uuid;
begin
  if p_role not in ('admin', 'manager', 'cashier') then raise exception 'Invalid staff role' using errcode = '22023'; end if;
  if cardinality(p_branch_ids) = 0 then raise exception 'Select at least one branch' using errcode = '22023'; end if;
  foreach v_branch_id in array p_branch_ids loop
    select b.organization_id into v_org_id
    from public.branch_memberships m join public.branches b on b.id = m.branch_id and b.active
    join public.profiles p on p.id = m.user_id and p.active
    where m.user_id = p_actor_id and m.branch_id = v_branch_id and m.role in ('owner', 'admin');
    if v_org_id is null then raise exception 'Administrator access is required for every selected branch' using errcode = '42501'; end if;
    insert into public.branch_memberships (user_id, branch_id, role) values (p_new_user_id, v_branch_id, p_role)
    on conflict (user_id, branch_id) do update set role = excluded.role;
  end loop;
  insert into public.activity_log (organization_id, branch_id, user_id, event_type, details)
  select distinct b.organization_id, b.id, p_actor_id, 'staff_created',
    jsonb_build_object('staff_user_id', p_new_user_id, 'role', p_role)
  from public.branches b where b.id = any(p_branch_ids);
end;
$$;

revoke all on function public.create_staff_membership(uuid,uuid,uuid[],text) from public, anon, authenticated;
grant execute on function public.create_staff_membership(uuid,uuid,uuid[],text) to service_role;
