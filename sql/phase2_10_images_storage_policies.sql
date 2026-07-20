-- ============================================================
-- 30 — Storage policies for the "images" bucket (movie posters)
-- Allows any authenticated user to upload/update/delete poster
-- images, and allows public read (bucket must be created as
-- Public in the Supabase dashboard first).
-- ============================================================

CREATE POLICY "images_public_read" ON storage.objects FOR SELECT
    USING (bucket_id = 'images');

CREATE POLICY "images_authenticated_insert" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'images');

CREATE POLICY "images_authenticated_update" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'images');

CREATE POLICY "images_authenticated_delete" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'images');
