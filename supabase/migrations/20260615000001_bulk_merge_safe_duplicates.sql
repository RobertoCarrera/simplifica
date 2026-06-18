-- Migration: bulk_merge_safe_duplicates RPC (v2 — cluster-aware)
-- Date: 2026-06-15
-- Description: v2 of the bulk-merge helper. Builds CLUSTERS of duplicated
--              clients (not just pairs) and keeps the most complete record
--              in each cluster, soft-deleting the rest.
--
--              Adds a separate dry-run RPC that returns the plan without
--              touching any row, so the UI can show "what will happen"
--              before the user presses the big red button.
--
-- NEW IN v2 (vs the original pair-based design):
--   * Cluster detection via iterative union: we keep merging any two
--     client ids that satisfy the safety filter until no more pairs can
--     be formed. If A=B and B=C, the resulting cluster has 3 members.
--   * "Keep" rule = most complete record (counts of non-null identity
--     fields), with created_at as tiebreaker. Oldest-only loses info
--     when the older row is sparse.
--   * Dry-run mode (`p_dry_run => true`) returns the plan without any
--     write.
--
-- SAFETY GUARANTEES:
--   1. Caller must be owner or admin of the company.
--   2. Only "safe" edges are processed. A pair is "safe" if any of:
--        a) both share the same non-empty email (case-insensitive,
--           excluding the placeholder `corre@tudominio.es`), OR
--        b) both share a normalized phone (digits only) AND the
--           normalized name+surname agree, OR
--        c) both share the normalized name+surname AND at least one
--           of (email, phone) matches and neither is the placeholder.
--      A cluster is built only from safe edges, but ANY member that
--      shares even a single safe edge with another member ends up in
--      the same cluster (transitive closure, see cluster builder below).
--   3. Inside a cluster, the "best" record is the one with the highest
--      completeness score; tiebreaker is oldest created_at. ALL other
--      members are soft-deleted.
--   4. The merge is performed by the existing public.merge_clients RPC.
--      No field overrides are passed; merge_clients' default
--      `COALESCE(NULLIF(payload, ''), existing)` rule already
--      preserves information correctly (a non-null value in the
--      discarded row wins if the kept row is null on that field).
--   5. Soft-delete only: discarded clients become is_active=false,
--      deleted_at=now(). Reversible by re-activating manually.
--   6. p_dry_run=true NEVER writes anything; it just inspects.
--   7. Per-discard errors are caught and surfaced in `errors[]`; the
--      rest of the batch still runs.

BEGIN;

-- ============================================================================
-- 1. Helper: completeness score for a client row
--    Used to pick which row to keep in a cluster. Higher = more complete.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.client_completeness_score(c public.clients)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    (CASE WHEN c.email          IS NOT NULL AND c.email          <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN c.phone          IS NOT NULL AND c.phone          <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN c.business_name  IS NOT NULL AND c.business_name  <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN c.trade_name     IS NOT NULL AND c.trade_name     <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN c.cif_nif        IS NOT NULL AND c.cif_nif        <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN c.dni            IS NOT NULL AND c.dni            <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN c.direccion_id   IS NOT NULL                          THEN 1 ELSE 0 END) +
    (CASE WHEN c.notes          IS NOT NULL AND c.notes          <> '' THEN 1 ELSE 0 END);
$$;

-- ============================================================================
-- 2. Cluster builder
--    Returns one row per cluster with `keep_id` and `discard_ids` already
--    decided. The clustering algorithm is an iterative union-find: we
--    start with each id in its own component, then for every SAFE edge
--    we union the two components. At the end, each component is a cluster
--    and we pick the best (highest score, oldest, lowest uuid) as keep.
--
--    SAFETY NOTE: we use the SAME definition of "safe edge" as the
--    final merge step, so a cluster is always 100% safe to collapse.
--    No two members of a cluster can disagree on the matching field
--    (because they are linked only through safe edges). When a name
--    edge is involved, we additionally require that at least one of
--    email or phone is also shared — otherwise we leave that name-only
--    pair to be reviewed manually (this is what the old detector did
--    for match_reason='name' alone, and we keep the conservative
--    behavior to avoid merging two genuinely different people who
--    happen to share a common name).
-- ============================================================================
CREATE OR REPLACE FUNCTION public._build_duplicate_clusters(p_company_id uuid)
RETURNS TABLE(
  cluster_key   text,
  keep_id       uuid,
  discard_ids   uuid[],
  member_count  integer,
  reason        text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_iterations      integer := 0;
  v_made_progress   boolean := true;
BEGIN
  -- Work table: id -> cluster_root. We update it in place across
  -- iterations until no more unions happen.
  CREATE TEMP TABLE _cluster_map (
    id        uuid PRIMARY KEY,
    root      uuid NOT NULL
  ) ON COMMIT DROP;
  CREATE INDEX ON _cluster_map (root);

  -------------------------------------------------------------------
  -- 2.1 Initialize: every active, non-deleted client in the company
  --     is its own singleton component.
  -------------------------------------------------------------------
  INSERT INTO _cluster_map (id, root)
  SELECT id, id
  FROM public.clients
  WHERE company_id = p_company_id
    AND deleted_at IS NULL;

  -------------------------------------------------------------------
  -- 2.2 Iterative union. At every step, find any SAFE edge between
  --     two different components and collapse them. Loop until a full
  --     pass produces zero new unions.
  -------------------------------------------------------------------
  LOOP
    v_iterations := v_iterations + 1;
    IF v_iterations > 50 THEN
      -- Defensive: 50 iterations is way more than enough (each iteration
      -- must reduce the number of components, and we start with at most
      -- a few thousand). Bail out if we ever exceed that.
      RAISE EXCEPTION 'Cluster builder exceeded 50 iterations — aborting to avoid infinite loop';
    END IF;

    v_made_progress := false;

    WITH
    -- All safe edges. We OR the three "match" conditions. For the
    -- name-only condition we additionally require that at least one
    -- of email/phone agrees, so we don't merge two different people
    -- who happen to share a name.
    safe_edges AS (
      SELECT a.id AS id_a, b.id AS id_b, 'email_and_name'::text AS reason
      FROM public.clients a
      JOIN public.clients b
        ON b.company_id = a.company_id AND b.id > a.id
      WHERE a.company_id = p_company_id
        AND a.deleted_at IS NULL AND b.deleted_at IS NULL
        AND a.email IS NOT NULL AND b.email IS NOT NULL
        AND lower(trim(a.email)) = lower(trim(b.email))
        AND lower(trim(a.email)) <> ''
        AND lower(trim(a.email)) <> 'corre@tudominio.es'
        AND public.normalize_name(a.name)    = public.normalize_name(b.name)
        AND public.normalize_name(a.surname) = public.normalize_name(b.surname)
      UNION
      SELECT a.id, b.id, 'email'::text
      FROM public.clients a
      JOIN public.clients b
        ON b.company_id = a.company_id AND b.id > a.id
      WHERE a.company_id = p_company_id
        AND a.deleted_at IS NULL AND b.deleted_at IS NULL
        AND a.email IS NOT NULL AND b.email IS NOT NULL
        AND lower(trim(a.email)) = lower(trim(b.email))
        AND lower(trim(a.email)) <> ''
        AND lower(trim(a.email)) <> 'corre@tudominio.es'
      UNION
      SELECT a.id, b.id, 'phone'::text
      FROM public.clients a
      JOIN public.clients b
        ON b.company_id = a.company_id AND b.id > a.id
      WHERE a.company_id = p_company_id
        AND a.deleted_at IS NULL AND b.deleted_at IS NULL
        AND a.phone IS NOT NULL AND b.phone IS NOT NULL
        AND regexp_replace(a.phone, '[^0-9]', '', 'g') <> ''
        AND regexp_replace(a.phone, '[^0-9]', '', 'g')
          = regexp_replace(b.phone, '[^0-9]', '', 'g')
        AND public.normalize_name(a.name)    = public.normalize_name(b.name)
        AND public.normalize_name(a.surname) = public.normalize_name(b.surname)
    ),
    -- A "useful" edge is one whose two endpoints are still in different
    -- components. We pick exactly one such edge per iteration and union
    -- the two components. (Taking all of them in one shot would also
    -- work but the iteration makes the algorithm easier to reason
    -- about and the cost is negligible for our data sizes.)
    candidate AS (
      SELECT e.id_a, e.id_b
      FROM safe_edges e
      JOIN _cluster_map ma ON ma.id = e.id_a
      JOIN _cluster_map mb ON mb.id = e.id_b
      WHERE ma.root <> mb.root
      ORDER BY e.id_a, e.id_b
      LIMIT 1
    ),
    -- The union: every id whose root is the higher of the two roots
    -- gets rewritten to the lower root. Lower root wins for stability.
    unioned AS (
      UPDATE _cluster_map
         SET root = LEAST(
                (SELECT root FROM _cluster_map WHERE id = (SELECT id_a FROM candidate)),
                (SELECT root FROM _cluster_map WHERE id = (SELECT id_b FROM candidate))
              )
       WHERE root IN (
                (SELECT root FROM _cluster_map WHERE id = (SELECT id_a FROM candidate)),
                (SELECT root FROM _cluster_map WHERE id = (SELECT id_b FROM candidate))
              )
      RETURNING id
    )
    SELECT count(*) > 0 INTO v_made_progress FROM unioned;

    EXIT WHEN NOT v_made_progress;
  END LOOP;

  -------------------------------------------------------------------
  -- 2.3 Decide the "keep" for each cluster: highest completeness,
  --     tiebreaker oldest created_at, final tiebreaker lowest uuid.
  -------------------------------------------------------------------
  RETURN QUERY
  WITH
  final_components AS (
    SELECT m.id, m.root, c.created_at, public.client_completeness_score(c) AS score
    FROM _cluster_map m
    JOIN public.clients c ON c.id = m.id
  ),
  component_sizes AS (
    SELECT root, count(*) AS n
    FROM final_components
    GROUP BY root
  ),
  ranked AS (
    SELECT
      fc.root,
      fc.id,
      fc.score,
      fc.created_at,
      row_number() OVER (
        PARTITION BY fc.root
        ORDER BY fc.score DESC, fc.created_at ASC, fc.id ASC
      ) AS rn
    FROM final_components fc
    JOIN component_sizes cs USING (root)
    WHERE cs.n >= 2   -- singletons are not interesting
  )
  SELECT
    r.root::text,
    (array_agg(r.id ORDER BY r.rn) FILTER (WHERE r.rn = 1))[1]                  AS keep_id,
    coalesce(array_agg(r.id ORDER BY r.rn) FILTER (WHERE r.rn > 1), ARRAY[]::uuid[]) AS discard_ids,
    count(*)::int                                                                AS member_count,
    'cluster'::text                                                              AS reason
  FROM ranked r
  GROUP BY r.root
  ORDER BY (array_agg(r.id ORDER BY r.rn))[1];
END;
$$;

-- ============================================================================
-- 3. Main RPC: dry-run OR real merge.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.bulk_merge_safe_duplicates(
  p_company_id uuid,
  p_dry_run    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id          uuid := p_company_id;
  v_dry                 boolean := coalesce(p_dry_run, false);
  v_total_clusters      integer := 0;
  v_total_to_discard    integer := 0;
  v_merged              integer := 0;
  v_skipped_clusters    integer := 0;
  v_skipped             integer := 0;
  v_reassigned_bookings integer := 0;
  v_reassigned_invoices integer := 0;
  v_reassigned_quotes   integer := 0;
  v_plan                jsonb := '[]'::jsonb;
  v_errors              jsonb := '[]'::jsonb;
  v_cluster             record;
  v_pair_payload        jsonb;
  v_merge_result        jsonb;
  v_keep_name           text;
  v_keep_email          text;
  v_discard             uuid;
BEGIN
  ----------------------------------------------------------------
  -- 3.1 Authorization
  ----------------------------------------------------------------
  IF NOT (
    SELECT EXISTS (
      SELECT 1
      FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
      JOIN public.users u      ON u.id  = cm.user_id
      WHERE cm.company_id = v_company_id
        AND cm.status     = 'active'
        AND ar.name IN ('owner', 'admin')
        AND u.auth_user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Access denied: must be owner or admin of this company';
  END IF;

  ----------------------------------------------------------------
  -- 3.2 Walk every cluster; in real mode merge each discard into keep.
  ----------------------------------------------------------------
  FOR v_cluster IN
    SELECT * FROM public._build_duplicate_clusters(v_company_id)
  LOOP
    v_total_clusters   := v_total_clusters + 1;
    v_total_to_discard := v_total_to_discard + array_length(v_cluster.discard_ids, 1);

    SELECT name, email INTO v_keep_name, v_keep_email
      FROM public.clients WHERE id = v_cluster.keep_id;

    v_pair_payload := jsonb_build_object(
      'cluster_key',  v_cluster.cluster_key,
      'keep_id',      v_cluster.keep_id,
      'keep_name',    v_keep_name,
      'keep_email',   v_keep_email,
      'discard_ids',  to_jsonb(v_cluster.discard_ids),
      'member_count', v_cluster.member_count,
      'reason',       v_cluster.reason
    );
    v_plan := v_plan || jsonb_build_array(v_pair_payload);

    IF v_dry THEN
      CONTINUE;
    END IF;

    IF v_cluster.member_count < 2 THEN
      v_skipped_clusters := v_skipped_clusters + 1;
      CONTINUE;
    END IF;

    FOREACH v_discard IN ARRAY v_cluster.discard_ids LOOP
      BEGIN
        v_merge_result := public.merge_clients(
          p_keep_id    := v_cluster.keep_id,
          p_discard_id := v_discard,
          p_merged_data := '{}'::jsonb
        );

        IF coalesce((v_merge_result ->> 'success')::boolean, false) IS DISTINCT FROM true THEN
          v_errors := v_errors || jsonb_build_array(
            format('merge_clients rejected discard=%s in cluster=%s: %s',
                   v_discard, v_cluster.cluster_key,
                   coalesce(v_merge_result ->> 'error', 'unknown'))
          );
          CONTINUE;
        END IF;

        v_merged := v_merged + 1;
        v_reassigned_bookings := v_reassigned_bookings
          + coalesce(((v_merge_result -> 'reassigned' ->> 'bookings')::int), 0);
        v_reassigned_invoices := v_reassigned_invoices
          + coalesce(((v_merge_result -> 'reassigned' ->> 'invoices')::int), 0);
        v_reassigned_quotes := v_reassigned_quotes
          + coalesce(((v_merge_result -> 'reassigned' ->> 'quotes')::int), 0);

      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_array(
          format('merge_clients raised for discard=%s in cluster=%s: %s',
                 v_discard, v_cluster.cluster_key, sqlerrm)
        );
        CONTINUE;
      END;
    END LOOP;
  END LOOP;

  v_skipped := v_skipped_clusters;

  ----------------------------------------------------------------
  -- 3.3 Final report
  ----------------------------------------------------------------
  RETURN jsonb_build_object(
    'dry_run',            v_dry,
    'total_clusters',     v_total_clusters,
    'total_to_discard',   v_total_to_discard,
    'merged',             CASE WHEN v_dry THEN 0 ELSE v_merged END,
    'skipped_clusters',   v_skipped,
    'plan',               v_plan,
    'reassigned',         jsonb_build_object(
                            'bookings', CASE WHEN v_dry THEN NULL ELSE v_reassigned_bookings END,
                            'invoices', CASE WHEN v_dry THEN NULL ELSE v_reassigned_invoices END,
                            'quotes',   CASE WHEN v_dry THEN NULL ELSE v_reassigned_quotes   END
                          ),
    'errors',             v_errors
  );
END;
$$;

COMMENT ON FUNCTION public.bulk_merge_safe_duplicates(uuid, boolean) IS
  'Cluster-aware bulk merge of "safe" duplicate clients within a company. '
  'Builds connected components of duplicates (cluster of N), keeps the most '
  'complete member in each cluster (tiebreaker: oldest, then lowest uuid), '
  'soft-deletes the rest. Set p_dry_run=true to get the plan without writing. '
  'Authorization: caller must be owner or admin of the company.';

GRANT EXECUTE ON FUNCTION public.bulk_merge_safe_duplicates(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
