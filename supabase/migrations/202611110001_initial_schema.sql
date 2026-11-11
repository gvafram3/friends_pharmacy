create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  currency text not null default 'GHS' check (currency = 'GHS'),
  created_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  code text not null check (length(trim(code)) between 2 and 24),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.branch_memberships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'cashier')),
  created_at timestamptz not null default now(),
  primary key (user_id, branch_id)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sku text not null,
  name text not null check (length(trim(name)) between 1 and 200),
  generic text not null default '',
  category text not null default 'General',
  selling_price numeric(12,2) not null check (selling_price > 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  prescription_only boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku)
);

create table if not exists public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  batch_number text not null default '',
  quantity integer not null check (quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0 and reserved_quantity <= quantity),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  expires_on date not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  receipt_number bigint generated always as identity,
  idempotency_key uuid not null,
  status text not null check (status in ('pending_payment', 'completed', 'payment_failed', 'cancelled')),
  payment_method text not null check (payment_method in ('cash', 'card', 'mobile_money')),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  total numeric(12,2) not null check (total >= 0),
  tendered numeric(12,2),
  patient_name text not null default '',
  prescriber text not null default '',
  paystack_reference text unique,
  paystack_transaction_id text,
  payment_url text,
  reservation_expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (branch_id, idempotency_key),
  check ((payment_method = 'cash' and status = 'completed') or payment_method <> 'cash'),
  check (payment_method <> 'cash' or tendered >= total)
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  prescription_only boolean not null default false,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0)
);

create table if not exists public.sale_item_batches (
  sale_item_id uuid not null references public.sale_items(id) on delete cascade,
  batch_id uuid not null references public.inventory_batches(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  primary key (sale_item_id, batch_id)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  batch_id uuid references public.inventory_batches(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  movement_type text not null check (movement_type in ('opening_stock', 'received', 'sale', 'payment_release', 'adjustment')),
  quantity_change integer not null check (quantity_change <> 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists inventory_batches_branch_product_expiry_idx
  on public.inventory_batches (branch_id, product_id, expires_on);
create index if not exists sales_branch_created_idx on public.sales (branch_id, created_at desc);
create index if not exists activity_log_branch_created_idx on public.activity_log (branch_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at before update on public.products
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.branch_memberships enable row level security;
alter table public.products enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_item_batches enable row level security;
alter table public.stock_movements enable row level security;
alter table public.activity_log enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to service_role;

create or replace function public.bootstrap_first_owner(
  p_user_id uuid,
  p_email text,
  p_organization_name text,
  p_branch_name text
) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  v_org_id uuid;
  v_branch_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('friends_pharmacy'), hashtext('initial_setup'));
  if exists (select 1 from public.organizations) then
    raise exception 'Initial setup has already been completed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id and lower(u.email) = lower(p_email)) then
    raise exception 'Authenticated user does not match the setup account' using errcode = '42501';
  end if;
  insert into public.profiles (id, email)
  values (p_user_id, lower(p_email))
  on conflict (id) do update set email = excluded.email;
  insert into public.organizations (name) values (trim(p_organization_name)) returning id into v_org_id;
  insert into public.branches (organization_id, name, code)
  values (v_org_id, trim(p_branch_name), 'MAIN') returning id into v_branch_id;
  insert into public.branch_memberships (user_id, branch_id, role) values (p_user_id, v_branch_id, 'owner');
  insert into public.activity_log (organization_id, branch_id, user_id, event_type, details)
  values (v_org_id, v_branch_id, p_user_id, 'initial_setup', jsonb_build_object('organization', p_organization_name));
  return jsonb_build_object('organization_id', v_org_id, 'branch_id', v_branch_id);
end;
$$;

create or replace function public.get_my_branches(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'name', b.name, 'code', b.code, 'organization_id', b.organization_id,
    'organization_name', o.name, 'role', m.role
  ) order by b.name), '[]'::jsonb)
  from public.branch_memberships m
  join public.branches b on b.id = m.branch_id and b.active
  join public.organizations o on o.id = b.organization_id
  join public.profiles p on p.id = m.user_id and p.active
  where m.user_id = p_user_id;
$$;

create or replace function public.get_branch_role(p_user_id uuid, p_branch_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select m.role
  from public.branch_memberships m
  join public.branches b on b.id = m.branch_id and b.active
  join public.profiles p on p.id = m.user_id and p.active
  where m.user_id = p_user_id and m.branch_id = p_branch_id;
$$;

create or replace function public.get_branch_products(p_user_id uuid, p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_role text;
begin
  select m.role into v_role
  from public.branch_memberships m
  join public.branches b on b.id = m.branch_id and b.active
  join public.profiles p on p.id = m.user_id and p.active
  where m.user_id = p_user_id and m.branch_id = p_branch_id;
  if v_role is null then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'sku', p.sku, 'name', p.name, 'generic', p.generic, 'category', p.category,
      'price', p.selling_price, 'min', p.min_stock, 'rx', p.prescription_only,
      'qty', coalesce(x.total_qty, 0), 'available', coalesce(x.available_qty, 0),
      'batches', coalesce(x.batches, '[]'::jsonb)
    ) order by p.name)
    from public.products p
    left join lateral (
      select sum(b.quantity) as total_qty,
        sum(greatest(0, b.quantity - b.reserved_quantity)) filter (where b.expires_on >= current_date) as available_qty,
        jsonb_agg(jsonb_build_object(
          'id', b.id, 'qty', b.quantity, 'reserved', b.reserved_quantity, 'available', greatest(0, b.quantity - b.reserved_quantity),
          'cost', case when v_role in ('owner', 'admin', 'manager') then b.unit_cost else null end,
          'exp', b.expires_on, 'batch_number', b.batch_number
        ) order by b.expires_on) as batches
      from public.inventory_batches b
      where b.product_id = p.id and b.branch_id = p_branch_id
    ) x on true
    where p.organization_id = (select organization_id from public.branches where id = p_branch_id)
      and p.active
  ), '[]'::jsonb);
end;
$$;

create or replace function public.receive_stock(
  p_user_id uuid, p_branch_id uuid, p_product_id uuid, p_quantity integer,
  p_unit_cost numeric, p_expires_on date, p_batch_number text default ''
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_org_id uuid;
  v_batch_id uuid;
begin
  select m.role, b.organization_id into v_role, v_org_id
  from public.branch_memberships m join public.branches b on b.id = m.branch_id
  join public.profiles p on p.id = m.user_id and p.active
  where m.user_id = p_user_id and m.branch_id = p_branch_id and b.active;
  if coalesce(v_role, '') not in ('owner', 'admin', 'manager') then raise exception 'Stock receiving requires manager access' using errcode = '42501'; end if;
  if p_quantity <= 0 or p_unit_cost < 0 or p_expires_on is null then raise exception 'Invalid stock batch values' using errcode = '22023'; end if;
  if not exists (select 1 from public.products where id = p_product_id and organization_id = v_org_id and active) then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  insert into public.inventory_batches (organization_id, branch_id, product_id, batch_number, quantity, unit_cost, expires_on, created_by)
  values (v_org_id, p_branch_id, p_product_id, coalesce(p_batch_number, ''), p_quantity, p_unit_cost, p_expires_on, p_user_id)
  returning id into v_batch_id;
  insert into public.stock_movements (organization_id, branch_id, product_id, batch_id, user_id, movement_type, quantity_change, note)
  values (v_org_id, p_branch_id, p_product_id, v_batch_id, p_user_id, 'received', p_quantity, 'Stock received');
  insert into public.activity_log (organization_id, branch_id, user_id, event_type, details)
  values (v_org_id, p_branch_id, p_user_id, 'stock_received',
    jsonb_build_object('product_id', p_product_id, 'batch_id', v_batch_id, 'quantity', p_quantity, 'expires_on', p_expires_on));
  return jsonb_build_object('batch_id', v_batch_id);
end;
$$;

create or replace function public.create_product(
  p_user_id uuid, p_branch_id uuid, p_sku text, p_name text, p_generic text, p_category text,
  p_selling_price numeric, p_min_stock integer, p_prescription_only boolean,
  p_opening_quantity integer, p_unit_cost numeric, p_expires_on date
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text; v_org_id uuid; v_product_id uuid; v_batch_id uuid;
begin
  select m.role, b.organization_id into v_role, v_org_id
  from public.branch_memberships m join public.branches b on b.id = m.branch_id
  join public.profiles p on p.id = m.user_id and p.active
  where m.user_id = p_user_id and m.branch_id = p_branch_id and b.active;
  if coalesce(v_role, '') not in ('owner', 'admin', 'manager') then raise exception 'Product management requires manager access' using errcode = '42501'; end if;
  if p_selling_price <= 0 or p_min_stock < 0 or p_opening_quantity < 0 or p_unit_cost < 0 or p_expires_on is null then
    raise exception 'Invalid product or opening stock values' using errcode = '22023';
  end if;
  insert into public.products (organization_id, sku, name, generic, category, selling_price, min_stock, prescription_only)
  values (v_org_id, trim(p_sku), trim(p_name), trim(coalesce(p_generic, '')), coalesce(nullif(trim(p_category), ''), 'General'),
    p_selling_price, p_min_stock, coalesce(p_prescription_only, false))
  returning id into v_product_id;
  insert into public.inventory_batches (organization_id, branch_id, product_id, quantity, unit_cost, expires_on, created_by)
  values (v_org_id, p_branch_id, v_product_id, p_opening_quantity, p_unit_cost, p_expires_on, p_user_id)
  returning id into v_batch_id;
  if p_opening_quantity > 0 then
    insert into public.stock_movements (organization_id, branch_id, product_id, batch_id, user_id, movement_type, quantity_change, note)
    values (v_org_id, p_branch_id, v_product_id, v_batch_id, p_user_id, 'opening_stock', p_opening_quantity, 'Opening stock');
  end if;
  insert into public.activity_log (organization_id, branch_id, user_id, event_type, details)
  values (v_org_id, p_branch_id, p_user_id, 'product_created',
    jsonb_build_object('product_id', v_product_id, 'sku', p_sku, 'name', p_name));
  return jsonb_build_object('id', v_product_id);
end;
$$;

create or replace function public.update_product(
  p_user_id uuid, p_branch_id uuid, p_product_id uuid, p_sku text, p_name text,
  p_generic text, p_category text, p_selling_price numeric, p_min_stock integer, p_prescription_only boolean
) returns void language plpgsql security definer set search_path = public as $$
declare v_role text; v_org_id uuid;
begin
  select m.role, b.organization_id into v_role, v_org_id
  from public.branch_memberships m join public.branches b on b.id = m.branch_id
  join public.profiles p on p.id = m.user_id and p.active
  where m.user_id = p_user_id and m.branch_id = p_branch_id and b.active;
  if coalesce(v_role, '') not in ('owner', 'admin', 'manager') then raise exception 'Product management requires manager access' using errcode = '42501'; end if;
  if p_selling_price <= 0 or p_min_stock < 0 then raise exception 'Invalid product values' using errcode = '22023'; end if;
  update public.products set sku = trim(p_sku), name = trim(p_name), generic = trim(coalesce(p_generic, '')),
    category = coalesce(nullif(trim(p_category), ''), 'General'), selling_price = p_selling_price,
    min_stock = p_min_stock, prescription_only = coalesce(p_prescription_only, false)
  where id = p_product_id and organization_id = v_org_id and active;
  if not found then raise exception 'Product not found' using errcode = 'P0002'; end if;
  insert into public.activity_log (organization_id, branch_id, user_id, event_type, details)
  values (v_org_id, p_branch_id, p_user_id, 'product_updated', jsonb_build_object('product_id', p_product_id));
end;
$$;

create or replace function public.deactivate_product(p_user_id uuid, p_branch_id uuid, p_product_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text; v_org_id uuid;
begin
  select m.role, b.organization_id into v_role, v_org_id
  from public.branch_memberships m join public.branches b on b.id = m.branch_id
  join public.profiles p on p.id = m.user_id and p.active
  where m.user_id = p_user_id and m.branch_id = p_branch_id and b.active;
  if coalesce(v_role, '') not in ('owner', 'admin', 'manager') then raise exception 'Product management requires manager access' using errcode = '42501'; end if;
  update public.products set active = false where id = p_product_id and organization_id = v_org_id and active;
  if not found then raise exception 'Product not found' using errcode = 'P0002'; end if;
  insert into public.activity_log (organization_id, branch_id, user_id, event_type, details)
  values (v_org_id, p_branch_id, p_user_id, 'product_deactivated', jsonb_build_object('product_id', p_product_id));
end;
$$;

create or replace function public.create_branch(p_user_id uuid, p_branch_name text, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org_id uuid; v_branch_id uuid; v_role text;
begin
  select b.organization_id, m.role into v_org_id, v_role
  from public.branch_memberships m join public.branches b on b.id = m.branch_id
  join public.profiles p on p.id = m.user_id and p.active
  where m.user_id = p_user_id and m.role in ('owner', 'admin') and b.active
  order by m.created_at limit 1;
  if v_org_id is null then raise exception 'Branch management requires administrator access' using errcode = '42501'; end if;
  insert into public.branches (organization_id, name, code)
  values (v_org_id, trim(p_branch_name), upper(trim(p_code))) returning id into v_branch_id;
  insert into public.branch_memberships (user_id, branch_id, role) values (p_user_id, v_branch_id, v_role);
  insert into public.activity_log (organization_id, branch_id, user_id, event_type, details)
  values (v_org_id, v_branch_id, p_user_id, 'branch_created', jsonb_build_object('name', p_branch_name, 'code', p_code));
  return jsonb_build_object('id', v_branch_id);
end;
$$;

create or replace function public.invite_staff_membership(
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
  select distinct b.organization_id, b.id, p_actor_id, 'staff_invited',
    jsonb_build_object('staff_user_id', p_new_user_id, 'role', p_role)
  from public.branches b where b.id = any(p_branch_ids);
end;
$$;

create or replace function public.create_sale(
  p_user_id uuid, p_branch_id uuid, p_items jsonb, p_discount_percent numeric,
  p_payment_method text, p_tendered numeric, p_patient_name text, p_prescriber text,
  p_idempotency_key uuid, p_paystack_reference text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_org_id uuid;
  v_sale_id uuid;
  v_sale public.sales%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_batch public.inventory_batches%rowtype;
  v_sale_item_id uuid;
  v_requested integer;
  v_remaining integer;
  v_take integer;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2);
  v_total numeric(12,2);
  v_cost numeric(12,2);
  v_rx boolean := false;
begin
  perform public.expire_pending_payments();
  select m.role, b.organization_id into v_role, v_org_id
  from public.branch_memberships m join public.branches b on b.id = m.branch_id
  join public.profiles p on p.id = m.user_id and p.active
  where m.user_id = p_user_id and m.branch_id = p_branch_id and b.active;
  if v_role is null then raise exception 'Branch access denied' using errcode = '42501'; end if;
  if p_payment_method not in ('cash', 'card', 'mobile_money') then raise exception 'Invalid payment method' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one item' using errcode = '22023'; end if;
  if p_discount_percent < 0 or p_discount_percent > 100 then raise exception 'Discount must be between 0 and 100 percent' using errcode = '22023'; end if;
  if p_payment_method = 'cash' and (p_tendered is null or p_tendered < 0) then raise exception 'Invalid cash tender' using errcode = '22023'; end if;

  select * into v_sale from public.sales where branch_id = p_branch_id and idempotency_key = p_idempotency_key;
  if found then
    if v_sale.created_by is distinct from p_user_id or v_sale.payment_method <> p_payment_method then
      raise exception 'Checkout request identifier does not match this sale' using errcode = '22023';
    end if;
    return jsonb_build_object('id', v_sale.id, 'receipt_number', v_sale.receipt_number, 'status', v_sale.status,
      'total', v_sale.total, 'payment_url', v_sale.payment_url, 'reference', v_sale.paystack_reference);
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_requested := (v_item ->> 'quantity')::integer;
    if v_requested <= 0 then raise exception 'Quantities must be whole numbers greater than zero' using errcode = '22023'; end if;
    select * into v_product from public.products
    where id = (v_item ->> 'product_id')::uuid and organization_id = v_org_id and active for update;
    if not found then raise exception 'Product not found' using errcode = 'P0002'; end if;
    v_subtotal := v_subtotal + v_product.selling_price * v_requested;
    v_rx := v_rx or v_product.prescription_only;
    if (v_item ->> 'quantity')::numeric <> v_requested then raise exception 'Quantities must be whole numbers' using errcode = '22023'; end if;
  end loop;
  if v_rx and length(trim(coalesce(p_patient_name, ''))) = 0 then raise exception 'Patient name is required for prescription-only products' using errcode = '22023'; end if;
  v_discount := round(v_subtotal * p_discount_percent / 100, 2);
  v_total := v_subtotal - v_discount;
  if p_payment_method = 'cash' and p_tendered < v_total then raise exception 'Cash received must cover the sale total' using errcode = '22023'; end if;
  if p_payment_method <> 'cash' and v_total <= 0 then raise exception 'Payment amount must be greater than zero' using errcode = '22023'; end if;

  insert into public.sales (
    organization_id, branch_id, idempotency_key, status, payment_method, subtotal, discount_amount, total,
    tendered, patient_name, prescriber, paystack_reference, reservation_expires_at, created_by, completed_at
  ) values (
    v_org_id, p_branch_id, p_idempotency_key,
    case when p_payment_method = 'cash' then 'completed' else 'pending_payment' end,
    p_payment_method, v_subtotal, v_discount, v_total, p_tendered,
    case when v_rx then trim(p_patient_name) else '' end,
    case when v_rx then trim(coalesce(p_prescriber, '')) else '' end,
    p_paystack_reference,
    case when p_payment_method = 'cash' then null else now() + interval '30 minutes' end,
    p_user_id, case when p_payment_method = 'cash' then now() else null end
  ) returning * into v_sale;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_requested := (v_item ->> 'quantity')::integer;
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid and organization_id = v_org_id;
    v_remaining := v_requested;
    v_cost := 0;
    insert into public.sale_items (sale_id, product_id, product_name, prescription_only, quantity, unit_price, unit_cost)
    values (v_sale.id, v_product.id, v_product.name, v_product.prescription_only, v_requested, v_product.selling_price, 0)
    returning id into v_sale_item_id;
    for v_batch in
      select * from public.inventory_batches
      where product_id = v_product.id and branch_id = p_branch_id and expires_on >= current_date
        and quantity - reserved_quantity > 0
      order by expires_on, created_at, id for update
    loop
      exit when v_remaining = 0;
      v_take := least(v_remaining, v_batch.quantity - v_batch.reserved_quantity);
      if p_payment_method = 'cash' then
        update public.inventory_batches set quantity = quantity - v_take where id = v_batch.id;
        insert into public.stock_movements (organization_id, branch_id, product_id, batch_id, sale_id, user_id, movement_type, quantity_change, note)
        values (v_org_id, p_branch_id, v_product.id, v_batch.id, v_sale.id, p_user_id, 'sale', -v_take, 'Cash sale');
      else
        update public.inventory_batches set reserved_quantity = reserved_quantity + v_take where id = v_batch.id;
      end if;
      insert into public.sale_item_batches (sale_item_id, batch_id, quantity) values (v_sale_item_id, v_batch.id, v_take);
      v_cost := v_cost + v_batch.unit_cost * v_take;
      v_remaining := v_remaining - v_take;
    end loop;
    if v_remaining > 0 then raise exception 'Insufficient unexpired stock for %', v_product.name using errcode = 'P0001'; end if;
    update public.sale_items set unit_cost = round(v_cost / v_requested, 2) where id = v_sale_item_id;
  end loop;

  insert into public.activity_log (organization_id, branch_id, user_id, event_type, details)
  values (v_org_id, p_branch_id, p_user_id,
    case when p_payment_method = 'cash' then 'sale_completed' else 'payment_pending' end,
    jsonb_build_object('sale_id', v_sale.id, 'receipt_number', v_sale.receipt_number, 'total', v_total));
  return jsonb_build_object('id', v_sale.id, 'receipt_number', v_sale.receipt_number, 'status', v_sale.status,
    'total', v_sale.total, 'payment_url', null, 'reference', v_sale.paystack_reference);
exception
  when unique_violation then
    select * into v_sale from public.sales where branch_id = p_branch_id and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('id', v_sale.id, 'receipt_number', v_sale.receipt_number, 'status', v_sale.status,
        'total', v_sale.total, 'payment_url', v_sale.payment_url, 'reference', v_sale.paystack_reference);
    end if;
    raise;
end;
$$;

create or replace function public.set_payment_url(p_reference text, p_payment_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.sales set payment_url = p_payment_url
  where paystack_reference = p_reference and status = 'pending_payment';
  if not found then raise exception 'Pending payment not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.confirm_paystack_payment(
  p_reference text, p_transaction_id text, p_amount_minor bigint, p_currency text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sale public.sales%rowtype; v_alloc record;
begin
  select * into v_sale from public.sales where paystack_reference = p_reference for update;
  if not found then raise exception 'Payment reference not found' using errcode = 'P0002'; end if;
  if v_sale.status = 'completed' then return jsonb_build_object('status', 'completed', 'receipt_number', v_sale.receipt_number); end if;
  if v_sale.status <> 'pending_payment' then raise exception 'Payment is no longer pending' using errcode = 'P0001'; end if;
  if v_sale.reservation_expires_at < now() then raise exception 'Payment reservation expired' using errcode = 'P0001'; end if;
  if p_currency <> 'GHS' or p_amount_minor <> round(v_sale.total * 100)::bigint then
    raise exception 'Verified payment amount or currency does not match sale' using errcode = '22023';
  end if;
  for v_alloc in
    select sib.batch_id, sib.quantity, si.product_id, si.id as sale_item_id
    from public.sale_items si join public.sale_item_batches sib on sib.sale_item_id = si.id
    where si.sale_id = v_sale.id
  loop
    update public.inventory_batches
      set quantity = quantity - v_alloc.quantity, reserved_quantity = reserved_quantity - v_alloc.quantity
      where id = v_alloc.batch_id and reserved_quantity >= v_alloc.quantity and quantity >= v_alloc.quantity;
    if not found then raise exception 'Reserved inventory changed before payment confirmation' using errcode = 'P0001'; end if;
    insert into public.stock_movements (organization_id, branch_id, product_id, batch_id, sale_id, user_id, movement_type, quantity_change, note)
    values (v_sale.organization_id, v_sale.branch_id, v_alloc.product_id, v_alloc.batch_id, v_sale.id, v_sale.created_by, 'sale', -v_alloc.quantity, 'Verified Paystack payment');
  end loop;
  update public.sales set status = 'completed', paystack_transaction_id = p_transaction_id, completed_at = now()
    where id = v_sale.id;
  insert into public.activity_log (organization_id, branch_id, user_id, event_type, details)
  values (v_sale.organization_id, v_sale.branch_id, v_sale.created_by, 'payment_verified',
    jsonb_build_object('sale_id', v_sale.id, 'reference', p_reference, 'transaction_id', p_transaction_id));
  return jsonb_build_object('status', 'completed', 'receipt_number', v_sale.receipt_number);
end;
$$;

create or replace function public.release_paystack_payment(p_reference text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sale public.sales%rowtype; v_alloc record;
begin
  select * into v_sale from public.sales where paystack_reference = p_reference for update;
  if not found or v_sale.status <> 'pending_payment' then return jsonb_build_object('status', coalesce(v_sale.status, 'not_found')); end if;
  for v_alloc in
    select sib.batch_id, sib.quantity from public.sale_items si
    join public.sale_item_batches sib on sib.sale_item_id = si.id where si.sale_id = v_sale.id
  loop
    update public.inventory_batches set reserved_quantity = greatest(0, reserved_quantity - v_alloc.quantity)
      where id = v_alloc.batch_id;
  end loop;
  update public.sales set status = 'payment_failed', reservation_expires_at = null where id = v_sale.id;
  insert into public.activity_log (organization_id, branch_id, user_id, event_type, details)
  values (v_sale.organization_id, v_sale.branch_id, v_sale.created_by, 'payment_released',
    jsonb_build_object('sale_id', v_sale.id, 'reference', p_reference, 'reason', p_reason));
  return jsonb_build_object('status', 'payment_failed');
end;
$$;

create or replace function public.expire_pending_payments()
returns integer language plpgsql security definer set search_path = public as $$
declare v_sale record; v_count integer := 0;
begin
  for v_sale in select paystack_reference from public.sales
    where status = 'pending_payment' and reservation_expires_at < now() for update skip locked
  loop
    perform public.release_paystack_payment(v_sale.paystack_reference, 'Reservation expired');
    v_count := v_count + 1;
  end loop;
  return v_count;
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
    'patient', case when v_role in ('owner', 'admin', 'manager') then s.patient_name else '' end,
    'prescriber', case when v_role in ('owner', 'admin', 'manager') then s.prescriber else '' end,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.product_name, 'qty', i.quantity,
      'price', i.unit_price,
      'cost', case when v_role in ('owner', 'admin', 'manager') then i.unit_cost else null end,
      'rx', i.prescription_only)) from public.sale_items i where i.sale_id = s.id), '[]'::jsonb)
  ) order by s.created_at desc) from (
    select * from public.sales where branch_id = p_branch_id order by created_at desc limit 500
  ) s), '[]'::jsonb);
end;
$$;

create or replace function public.get_branch_sales_summary(p_user_id uuid, p_branch_id uuid)
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
  return jsonb_build_object(
    'today_total', coalesce((
      select sum(s.total) from public.sales s
      where s.branch_id = p_branch_id and s.status = 'completed'
        and s.completed_at >= current_date and s.completed_at < current_date + interval '1 day'
    ), 0),
    'today_count', (
      select count(*) from public.sales s
      where s.branch_id = p_branch_id and s.status = 'completed'
        and s.completed_at >= current_date and s.completed_at < current_date + interval '1 day'
    ),
    'today_profit', case when v_role in ('owner', 'admin', 'manager') then coalesce((
      select sum(coalesce((
        select sum(i.unit_price * i.quantity - coalesce((
            select sum(b.unit_cost * sib.quantity)
            from public.sale_item_batches sib
            join public.inventory_batches b on b.id = sib.batch_id
            where sib.sale_item_id = i.id
          ), 0))
        from public.sale_items i where i.sale_id = s.id
      ), 0) - s.discount_amount)
      from public.sales s
      where s.branch_id = p_branch_id and s.status = 'completed'
        and s.completed_at >= current_date and s.completed_at < current_date + interval '1 day'
    ), 0) else null end,
    'all_time_total', coalesce((
      select sum(s.total) from public.sales s
      where s.branch_id = p_branch_id and s.status = 'completed'
    ), 0),
    'best_seller', (
      select i.product_name from public.sale_items i
      join public.sales s on s.id = i.sale_id
      where s.branch_id = p_branch_id and s.status = 'completed'
      group by i.product_name order by sum(i.quantity) desc, i.product_name limit 1
    ),
    'best_seller_quantity', coalesce((
      select sum(i.quantity) from public.sale_items i
      join public.sales s on s.id = i.sale_id
      where s.branch_id = p_branch_id and s.status = 'completed'
      group by i.product_name order by sum(i.quantity) desc, i.product_name limit 1
    ), 0)
  );
end;
$$;

create or replace function public.get_branch_activity(p_user_id uuid, p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.branch_memberships m
    join public.branches b on b.id = m.branch_id and b.active
    join public.profiles p on p.id = m.user_id and p.active
    where m.user_id = p_user_id and m.branch_id = p_branch_id
  ) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', a.id, 'at', a.created_at, 'type', a.event_type, 'message', a.details::text,
    'user_email', p.email
  ) order by a.created_at desc) from (
      select * from public.activity_log where branch_id = p_branch_id order by created_at desc limit 500
    ) a left join public.profiles p on p.id = a.user_id), '[]'::jsonb);
end;
$$;

revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.bootstrap_first_owner(uuid,text,text,text) to service_role;
grant execute on function public.get_my_branches(uuid) to service_role;
grant execute on function public.get_branch_role(uuid,uuid) to service_role;
grant execute on function public.get_branch_products(uuid,uuid) to service_role;
grant execute on function public.receive_stock(uuid,uuid,uuid,integer,numeric,date,text) to service_role;
grant execute on function public.create_product(uuid,uuid,text,text,text,text,numeric,integer,boolean,integer,numeric,date) to service_role;
grant execute on function public.update_product(uuid,uuid,uuid,text,text,text,text,numeric,integer,boolean) to service_role;
grant execute on function public.deactivate_product(uuid,uuid,uuid) to service_role;
grant execute on function public.create_branch(uuid,text,text) to service_role;
grant execute on function public.invite_staff_membership(uuid,uuid,uuid[],text) to service_role;
grant execute on function public.create_sale(uuid,uuid,jsonb,numeric,text,numeric,text,text,uuid,text) to service_role;
grant execute on function public.set_payment_url(text,text) to service_role;
grant execute on function public.confirm_paystack_payment(text,text,bigint,text) to service_role;
grant execute on function public.release_paystack_payment(text,text) to service_role;
grant execute on function public.expire_pending_payments() to service_role;
grant execute on function public.get_branch_sales(uuid,uuid) to service_role;
grant execute on function public.get_branch_sales_summary(uuid,uuid) to service_role;
grant execute on function public.get_branch_activity(uuid,uuid) to service_role;
