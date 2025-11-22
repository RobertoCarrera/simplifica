begin;
  -- Enable Realtime for VeriFactu tables
  alter publication supabase_realtime add table verifactu.invoice_meta;
  alter publication supabase_realtime add table verifactu.events;
commit;
