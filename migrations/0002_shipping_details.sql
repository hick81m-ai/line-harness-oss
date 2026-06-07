ALTER TABLE form_submissions ADD COLUMN shipping_cost_inbound INTEGER;
ALTER TABLE form_submissions ADD COLUMN shipping_cost_outbound INTEGER;
ALTER TABLE form_submissions ADD COLUMN shipping_cost_hq INTEGER;
ALTER TABLE form_submissions ADD COLUMN sent_serial_number TEXT;
ALTER TABLE form_submissions ADD COLUMN hq_tracking_number TEXT;
ALTER TABLE form_submissions ADD COLUMN inventory_type TEXT;
ALTER TABLE form_submissions ADD COLUMN estimated_delivery_date TEXT;
ALTER TABLE form_submissions ADD COLUMN reply_notification_sent_at TEXT;
