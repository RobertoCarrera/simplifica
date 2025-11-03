-- VeriFactu step 2: immutability, audit, VAT breakdown, QR payload
begin;

-- 1) Immutability guard for finalized invoices
create or replace function public.invoices_immutability_guard()
returns trigger
language plpgsql
as $$
declare
  allowed text[] := array['payment_status','notes_internal','payment_method','payment_reference','paid_at','due_date'];
begin
  if old.state = 'final' then
    if ( (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) ) then
      raise exception 'Invoice is finalized and immutable; only limited fields are editable'
        using hint = 'Allowed: ' || array_to_string(allowed, ', ');
    end if;
  end if;
  return new;
end$$;

drop trigger if exists trg_invoices_immutable on public.invoices;
create trigger trg_invoices_immutable
before update on public.invoices
for each row execute function public.invoices_immutability_guard();

-- 2) GDPR audit trigger (best-effort)
create or replace function public.gdpr_audit_trigger()
returns trigger
language plpgsql
as $$
declare
  payload jsonb;
  tbl text := tg_table_schema || '.' || tg_table_name;
  act text := tg_op;
  rec_id text := coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id'));
begin
  payload := jsonb_build_object(
    'table', tbl,
    'op', act,
    'when', now(),
    'user', auth.uid(),
    'pk', rec_id,
    'new', case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    'old', case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end
  );
  perform pg_notify('gdpr_audit', payload::text);
  begin
    execute 'insert into public.gdpr_audit_log(action, details) values ($1,$2)'
      using concat('TRIGGER ', tbl, ' ', act), payload;
  exception when undefined_table or undefined_column then
    -- ignore if audit table/columns differ or do not exist
    null;
  end;
  return coalesce(new, old);
end$$;

drop trigger if exists trg_audit_invoices on public.invoices;
create trigger trg_audit_invoices
after insert or update on public.invoices
for each row execute function public.gdpr_audit_trigger();

drop trigger if exists trg_audit_verifactu_meta on verifactu.invoice_meta;
create trigger trg_audit_verifactu_meta
after insert or update on verifactu.invoice_meta
for each row execute function public.gdpr_audit_trigger();

drop trigger if exists trg_audit_verifactu_events on verifactu.events;
create trigger trg_audit_verifactu_events
after insert or update on verifactu.events
for each row execute function public.gdpr_audit_trigger();

-- 3) VAT breakdown from invoice_items (dynamic detection of columns)
create or replace function verifactu.compute_vat_breakdown(p_invoice_id uuid)
returns jsonb
stable
language plpgsql
as $$
declare
  rate_col text;
  qty_col text;
  price_col text;
  exists_rate boolean;
  exists_tax boolean;
  exists_qty boolean;
  exists_unit boolean;
  v_sql text;
  result jsonb;
begin
  -- detect columns
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='invoice_items' and column_name='vat_rate') into exists_rate;
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='invoice_items' and column_name='tax_rate') into exists_tax;
  rate_col := case when exists_rate then 'vat_rate' when exists_tax then 'tax_rate' else null end;

  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='invoice_items' and column_name='quantity') into exists_qty;
  qty_col := case when exists_qty then 'quantity' else null end;

  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='invoice_items' and column_name='unit_price') into exists_unit;
  if not exists_unit then
    select exists(select 1 from information_schema.columns where table_schema='public' and table_name='invoice_items' and column_name='price') into exists_unit;
    price_col := case when exists_unit then 'price' else null end;
  else
    price_col := 'unit_price';
  end if;

  if rate_col is null or qty_col is null or price_col is null then
    return null;  -- unknown schema; skip
  end if;

  v_sql := format(
    'select coalesce(jsonb_agg(jsonb_build_object(''rate'', t.%1$I, ''base'', t.base, ''tax'', t.tax) order by t.%1$I), ''[]''::jsonb)
     from (
       select %1$I, round(sum((%2$I * %3$I)::numeric), 2) as base,
              round(sum((%2$I * %3$I * (%1$I/100.0))::numeric), 2) as tax
       from public.invoice_items
       where invoice_id = $1
       group by %1$I
     ) t', rate_col, price_col, qty_col);

  execute v_sql using p_invoice_id into result;
  return result;
end$$;

-- 4) Update finalize_invoice to include VAT breakdown and QR payload
create or replace function public.finalize_invoice(p_invoice_id uuid, p_series text, p_device_id text default null, p_software_id text default null)
returns json
volatile
language plpgsql
as $$
declare
  v_company_id uuid;
  v_user uuid := auth.uid();
  v_number bigint;
  v_prev text;
  v_payload jsonb;
  v_hash text;
  v_vat jsonb;
  v_qr text;
begin
  select company_id into v_company_id from public.invoices where id = p_invoice_id;
  if v_company_id is null then
    raise exception 'Invoice % not found or missing company_id', p_invoice_id;
  end if;

  select number, previous_hash into v_number, v_prev from verifactu.get_next_invoice_number(v_company_id, p_series);

  v_vat := verifactu.compute_vat_breakdown(p_invoice_id);

  v_payload := jsonb_build_object(
    'invoice_id', p_invoice_id,
    'company_id', v_company_id,
    'series', p_series,
    'number', v_number,
    'currency', (select currency from public.invoices where id=p_invoice_id),
    'totals', jsonb_build_object(
      'base', (select total_tax_base from public.invoices where id=p_invoice_id),
      'vat', (select total_vat from public.invoices where id=p_invoice_id),
      'gross', (select total_gross from public.invoices where id=p_invoice_id)
    ),
    'vat_breakdown', coalesce(v_vat, '[]'::jsonb)
  );

  v_hash := verifactu.compute_invoice_hash(v_payload, v_prev);
  v_qr := 'SERIE:'||p_series||'|NUM:'||v_number||'|HASH:'||v_hash;

  insert into verifactu.invoice_meta(invoice_id, company_id, series, number, chained_hash, previous_hash, device_id, software_id, qr_payload, status, created_by)
  values (p_invoice_id, v_company_id, p_series, v_number, v_hash, v_prev, p_device_id, p_software_id, v_qr, 'pending', v_user)
  on conflict (invoice_id) do update
    set chained_hash = excluded.chained_hash,
        previous_hash = excluded.previous_hash,
        series = excluded.series,
        number = excluded.number,
        device_id = excluded.device_id,
        software_id = excluded.software_id,
        qr_payload = excluded.qr_payload,
        status = 'pending';

  update public.invoices set state='final' where id=p_invoice_id;

  insert into verifactu.events(company_id, invoice_id, event_type, payload)
  values (v_company_id, p_invoice_id, 'alta', v_payload);

  return json_build_object('invoice_id', p_invoice_id, 'series', p_series, 'number', v_number, 'hash', v_hash, 'qr', v_qr, 'vat_breakdown', coalesce(v_vat, '[]'::jsonb));
end$$;

commit;
