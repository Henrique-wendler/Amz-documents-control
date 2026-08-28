-- Allow authenticated inserts/updates to evaluate the attachment path CHECK.
-- The helper only returns a boolean and does not read table data.

grant execute on function private.file_path_has_credentials(text) to authenticated;
