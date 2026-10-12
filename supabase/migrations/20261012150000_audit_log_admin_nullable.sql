-- ============================================================
-- admin_audit_log.admin_id: NOT NULL and ON DELETE SET NULL cancel out
--
-- The column was declared
--
--   admin_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE SET NULL
--
-- which cannot both hold. Deleting the referenced user makes Postgres try to
-- write NULL into a NOT NULL column, so the delete fails with a raw 23502 —
-- "null value in column admin_id violates not-null constraint". The practical
-- effect is that any admin who has ever performed an audited action can never
-- be deleted, which also means an account-deletion request from someone who
-- happens to be an admin cannot be honoured.
--
-- Found while deleting a throwaway admin created for testing; it had exactly
-- one audit row, from grant_admin, and that was enough to make it permanent.
--
-- ON DELETE SET NULL is the right intent for an audit log: the record of what
-- happened should outlive the account that did it. So the NOT NULL goes,
-- rather than the cascade rule — dropping the row instead would delete
-- history, and RESTRICT would keep the account undeletable by design.
-- action, detail, target_user and created_at are untouched, so a row whose
-- admin has been deleted still says what was done and to whom.
-- ============================================================

alter table public.admin_audit_log
  alter column admin_id drop not null;

comment on column public.admin_audit_log.admin_id is
  'The admin who acted. NULL once that account is deleted — the audit row '
  'deliberately outlives it (ON DELETE SET NULL).';

-- ── Verify the two now agree ────────────────────────────────
do $$
declare
  v_nullable text;
  v_rule     text;
begin
  select is_nullable into v_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'admin_audit_log'
    and column_name = 'admin_id';

  if v_nullable <> 'YES' then
    raise exception 'admin_audit_log.admin_id is still NOT NULL';
  end if;

  select rc.delete_rule into v_rule
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name
   and kcu.constraint_schema = tc.constraint_schema
  join information_schema.referential_constraints rc
    on rc.constraint_name = tc.constraint_name
   and rc.constraint_schema = tc.constraint_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'admin_audit_log'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'admin_id';

  if v_rule is distinct from 'SET NULL' then
    raise exception
      'admin_audit_log.admin_id delete rule is %, expected SET NULL', v_rule;
  end if;

  raise notice 'admin_audit_log.admin_id: nullable, ON DELETE SET NULL — an admin can be deleted and the row survives';
end $$;
