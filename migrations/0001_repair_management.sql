ALTER TABLE submissions ADD COLUMN our_status TEXT DEFAULT '受付済み';
ALTER TABLE submissions ADD COLUMN hq_status TEXT DEFAULT '未申請';
ALTER TABLE submissions ADD COLUMN return_type TEXT;
ALTER TABLE submissions ADD COLUMN tracking_number_inbound TEXT;
ALTER TABLE submissions ADD COLUMN tracking_number_outbound TEXT;
ALTER TABLE submissions ADD COLUMN tracking_number_hq TEXT;
ALTER TABLE submissions ADD COLUMN video_reminder_sent_at TEXT;
ALTER TABLE submissions ADD COLUMN drive_folder_url TEXT;
ALTER TABLE submissions ADD COLUMN admin_memo TEXT;
