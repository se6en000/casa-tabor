-- gmail_scan_enabled was defaulting to false, which silently blocked all email scanning.
-- Change the default to true so new tokens are scanned automatically.
-- Also enable scanning for any existing family members who haven't explicitly opted out.

alter table google_tokens
  alter column gmail_scan_enabled set default true;

-- Enable for all existing rows that haven't been explicitly set
update google_tokens
  set gmail_scan_enabled = true
  where gmail_scan_enabled is false or gmail_scan_enabled is null;
