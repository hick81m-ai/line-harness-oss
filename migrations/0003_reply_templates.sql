CREATE TABLE IF NOT EXISTS reply_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO reply_templates (id, type, name, content) VALUES
('tpl-1', 'video_request', '動画依頼', '{name}様

この度はShaken故障申請をいただきありがとうございます。
受付番号：{receipt_number}

以下の症状について、確認のための動画・写真をLINEにてお送りいただけますでしょうか。

{symptom_guide}

お手数をおかけしますが、よろしくお願いいたします。'),
('tpl-2', 'return_request_exchange', '返送依頼（交換確定）', '{name}様

内容を確認いたしました。
交換対応とさせていただきますので、お手数ですが製品をご返送ください。

【返送先】
〒000-0000
住所をここに入力
担当者名
TEL: 000-0000-0000

ご返送の際は追跡番号をお知らせください。
よろしくお願いいたします。'),
('tpl-3', 'return_request_inspection', '返送依頼（弊社検証）', '{name}様

内容を確認いたしました。
詳細確認のため、一度製品をお送りいただけますでしょうか。

【返送先】
〒000-0000
住所をここに入力
担当者名
TEL: 000-0000-0000

ご返送の際は追跡番号をお送りください。
よろしくお願いいたします。'),
('tpl-4', 'shipping_complete', '発送完了', '{name}様

交換品を発送いたしました。
到着まで今しばらくお待ちください。

ご不明な点がございましたらお気軽にご連絡ください。
よろしくお願いいたします。');
