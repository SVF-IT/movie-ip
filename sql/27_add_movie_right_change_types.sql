-- Migration 27: Allow staging changes to movie_rights ("Rights We Own" —
-- Satellite/Internet/Negative/Airborne/Ship/Other), which previously had no
-- approval-workflow support at all. Editors could edit these rows in the UI
-- but saving never persisted anything for them (silently no-op).

ALTER TABLE movie_pending_changes DROP CONSTRAINT IF EXISTS movie_pending_changes_change_type_check;

ALTER TABLE movie_pending_changes ADD CONSTRAINT movie_pending_changes_change_type_check CHECK (
    change_type IN (
        'movie_fields',
        'right_create',
        'right_update',
        'right_delete',
        'movie_right_create',
        'movie_right_update',
        'movie_right_delete',
        'person_add',
        'person_remove'
    )
);
