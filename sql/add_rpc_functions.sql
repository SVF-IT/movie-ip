-- Transactional RPC functions for rights operations
-- These replace multi-step client-side operations with atomic server-side transactions

-- Renew a right: creates history entry and updates end date atomically
CREATE OR REPLACE FUNCTION public.renew_right(
  p_right_id UUID,
  p_new_end_date DATE,
  p_remarks TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_right platform_rights%ROWTYPE;
  v_updated platform_rights%ROWTYPE;
BEGIN
  -- Lock the row to prevent concurrent modifications
  SELECT * INTO v_right
  FROM platform_rights
  WHERE id = p_right_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Right not found' USING ERRCODE = 'PGRST116';
  END IF;

  -- Insert history entry
  INSERT INTO rights_history (
    movie_id, platform_id, rights_type_id, license_type,
    category, nature, start_date, end_date, territory,
    change_type, new_right_id, remarks
  ) VALUES (
    v_right.movie_id, v_right.platform_id, v_right.rights_type_id,
    v_right.license_type, v_right.category, v_right.nature,
    v_right.start_date, v_right.end_date, v_right.territory,
    'renewed', p_right_id, p_remarks
  );

  -- Update the right with new end date
  UPDATE platform_rights
  SET end_date = p_new_end_date,
      remarks = COALESCE(p_remarks, remarks),
      updated_at = NOW()
  WHERE id = p_right_id
  RETURNING * INTO v_updated;

  RETURN to_jsonb(v_updated);
END;
$$;

-- Transfer a right: marks old as not current, creates history, creates new right atomically
CREATE OR REPLACE FUNCTION public.transfer_right(
  p_right_id UUID,
  p_new_platform_id UUID,
  p_new_start_date DATE,
  p_new_end_date DATE,
  p_remarks TEXT DEFAULT NULL,
  p_agreement_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_right platform_rights%ROWTYPE;
  v_new_right platform_rights%ROWTYPE;
BEGIN
  -- Lock the row to prevent concurrent modifications
  SELECT * INTO v_right
  FROM platform_rights
  WHERE id = p_right_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Right not found' USING ERRCODE = 'PGRST116';
  END IF;

  -- Mark current right as not current
  UPDATE platform_rights
  SET is_current = false
  WHERE id = p_right_id;

  -- Insert history entry
  INSERT INTO rights_history (
    movie_id, platform_id, rights_type_id, license_type,
    category, nature, start_date, end_date, territory,
    change_type, remarks
  ) VALUES (
    v_right.movie_id, v_right.platform_id, v_right.rights_type_id,
    v_right.license_type, v_right.category, v_right.nature,
    v_right.start_date, v_right.end_date, v_right.territory,
    'transferred', p_remarks
  );

  -- Create new right with new platform and agreement tracking
  INSERT INTO platform_rights (
    movie_id, platform_id, rights_type_id, license_type,
    category, nature, start_date, end_date, territory,
    is_current, remarks, agreement_id
  ) VALUES (
    v_right.movie_id, p_new_platform_id, v_right.rights_type_id,
    v_right.license_type, v_right.category, v_right.nature,
    p_new_start_date, p_new_end_date, v_right.territory,
    true, p_remarks, COALESCE(p_agreement_id, v_right.agreement_id)
  )
  RETURNING * INTO v_new_right;

  RETURN to_jsonb(v_new_right);
END;
$$;
