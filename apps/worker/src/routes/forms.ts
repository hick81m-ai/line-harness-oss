import { Hono } from 'hono';
import {
  getForms,
  getFormsWithStats,
  getFormById,
  createForm,
  updateForm,
  deleteForm,
  getFormSubmissions,
  createFormSubmission,
  jstNow,
} from '@line-crm/db';
import { getFriendByLineUserId, getFriendById } from '@line-crm/db';
import { addTagToFriend, enrollFriendInScenario } from '@line-crm/db';
import type {
  Form as DbForm,
  FormSubmission as DbFormSubmission,
  FormUsedByAccount,
} from '@line-crm/db';
import type { Env } from '../index.js';

const forms = new Hono<Env>();

// ─── 症状別メッセージ設定 ────────────────────────────────────────
// 症状ごとに異なるメッセージを設定できます。
// キー：症状テキスト（部分一致）
// value：追加メッセージ
const SYMPTOM_MESSAGES: Record<string, string> = {
  '電源が入らない': '電源が入らない症状の場合、充電状態・電源ボタンの長押し動作の動画をお送りください。',
  '充電ができない': '充電ができない症状の場合、充電器接続時の状態を動画でお送りください。',
  '温かくならない': '温かくならない症状の場合、電源ON後5分経過した状態の動画をお送りください。',
  '振動がない/弱い': '振動がない/弱い症状の場合、振動モード作動時の状態を動画でお送りください。',
  'ベルトの空気が入らない': 'ベルトの空気が入らない症状の場合、膨張モード作動時の状態を動画でお送りください。',
  '左右差がある': '左右差がある症状の場合、両側同時に動作している状態を動画でお送りください。',
  '異音がする': '異音がする症状の場合、異音が発生している状態を動画でお送りください。',
  '破損・傷がある': '破損・傷がある症状の場合、破損箇所がわかる写真をお送りください。',
};

function getSymptomMessage(failureDescription: string): string {
  for (const [symptom, message] of Object.entries(SYMPTOM_MESSAGES)) {
    if (failureDescription.includes(symptom)) {
      return message;
    }
  }
  return '症状がわかる動画または写真をお送りください。';
}
// ────────────────────────────────────────────────────────────────

function serializeForm(
  row: DbForm,
  extra?: { lastSubmittedAt?: string | null; usedByAccounts?: FormUsedByAccount[] },
) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    fields: JSON.parse(row.fields || '[]') as unknown[],
    onSubmitTagId: row.on_submit_tag_id,
    onSubmitScenarioId: row.on_submit_scenario_id,
    onSubmitMessageType: row.on_submit_message_type,
    onSubmitMessageContent: row.on_submit_message_content,
    onSubmitWebhookUrl: row.on_submit_webhook_url,
    onSubmitWebhookHeaders: row.on_submit_webhook_headers,
    onSubmitWebhookFailMessage: row.on_submit_webhook_fail_message,
    saveToMetadata: Boolean(row.save_to_metadata),
    isActive: Boolean(row.is_active),
    submitCount: row.submit_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSubmittedAt: extra?.lastSubmittedAt ?? null,
    usedByAccounts: extra?.usedByAccounts ?? [],
  };
}

function serializeSubmission(row: DbFormSubmission & { friend_name?: string | null }) {
  return {
    id: row.id,
    formId: row.form_id,
    friendId: row.friend_id,
    friendName: row.friend_name || null,
    data: JSON.parse(row.data || '{}') as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

forms.get('/api/forms', async (c) => {
  try {
    const items = await getFormsWithStats(c.env.DB);
    return c.json({
      success: true,
      data: items.map((row) =>
        serializeForm(row, {
          lastSubmittedAt: row.last_submitted_at,
          usedByAccounts: row.used_by_accounts,
        }),
      ),
    });
  } catch (err) {
    console.error('GET /api/forms error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

forms.get('/api/forms/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const form = await getFormById(c.env.DB, id);
    if (!form) return c.json({ success: false, error: 'Form not found' }, 404);
    return c.json({ success: true, data: serializeForm(form) });
  } catch (err) {
    console.error('GET /api/forms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

forms.post('/api/forms', async (c) => {
  try {
    const body = await c.req.json<{
      name: string;
      description?: string | null;
      fields?: unknown[];
      onSubmitTagId?: string | null;
      onSubmitScenarioId?: string | null;
      onSubmitMessageType?: 'text' | 'flex' | null;
      onSubmitMessageContent?: string | null;
      onSubmitWebhookUrl?: string | null;
      onSubmitWebhookHeaders?: string | null;
      onSubmitWebhookFailMessage?: string | null;
      saveToMetadata?: boolean;
    }>();
    if (!body.name) return c.json({ success: false, error: 'name is required' }, 400);
    const form = await createForm(c.env.DB, {
      name: body.name,
      description: body.description ?? null,
      fields: JSON.stringify(body.fields ?? []),
      onSubmitTagId: body.onSubmitTagId ?? null,
      onSubmitScenarioId: body.onSubmitScenarioId ?? null,
      onSubmitMessageType: body.onSubmitMessageType ?? null,
      onSubmitMessageContent: body.onSubmitMessageContent ?? null,
      onSubmitWebhookUrl: body.onSubmitWebhookUrl ?? null,
      onSubmitWebhookHeaders: body.onSubmitWebhookHeaders ?? null,
      onSubmitWebhookFailMessage: body.onSubmitWebhookFailMessage ?? null,
      saveToMetadata: body.saveToMetadata,
    });
    return c.json({ success: true, data: serializeForm(form) }, 201);
  } catch (err) {
    console.error('POST /api/forms error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

forms.put('/api/forms/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      name?: string;
      description?: string | null;
      fields?: unknown[];
      onSubmitTagId?: string | null;
      onSubmitScenarioId?: string | null;
      onSubmitMessageType?: 'text' | 'flex' | null;
      onSubmitMessageContent?: string | null;
      onSubmitWebhookUrl?: string | null;
      onSubmitWebhookHeaders?: string | null;
      onSubmitWebhookFailMessage?: string | null;
      saveToMetadata?: boolean;
      isActive?: boolean;
    }>();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.fields !== undefined) updates.fields = JSON.stringify(body.fields);
    if (body.onSubmitTagId !== undefined) updates.onSubmitTagId = body.onSubmitTagId;
    if (body.onSubmitScenarioId !== undefined) updates.onSubmitScenarioId = body.onSubmitScenarioId;
    if (body.onSubmitMessageType !== undefined) updates.onSubmitMessageType = body.onSubmitMessageType;
    if (body.onSubmitMessageContent !== undefined) updates.onSubmitMessageContent = body.onSubmitMessageContent;
    if (body.onSubmitWebhookUrl !== undefined) updates.onSubmitWebhookUrl = body.onSubmitWebhookUrl;
    if (body.onSubmitWebhookHeaders !== undefined) updates.onSubmitWebhookHeaders = body.onSubmitWebhookHeaders;
    if (body.onSubmitWebhookFailMessage !== undefined) updates.onSubmitWebhookFailMessage = body.onSubmitWebhookFailMessage;
    if (body.saveToMetadata !== undefined) updates.saveToMetadata = body.saveToMetadata;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    const updated = await updateForm(c.env.DB, id, updates as any);
    if (!updated) return c.json({ success: false, error: 'Form not found' }, 404);
    return c.json({ success: true, data: serializeForm(updated) });
  } catch (err) {
    console.error('PUT /api/forms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

forms.delete('/api/forms/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const form = await getFormById(c.env.DB, id);
    if (!form) return c.json({ success: false, error: 'Form not found' }, 404);
    await deleteForm(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/forms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

forms.get('/api/forms/:id/submissions', async (c) => {
  try {
    const id = c.req.param('id');
    const form = await getFormById(c.env.DB, id);
    if (!form) return c.json({ success: false, error: 'Form not found' }, 404);
    const submissions = await getFormSubmissions(c.env.DB, id);
    return c.json({ success: true, data: submissions.map(serializeSubmission) });
  } catch (err) {
    console.error('GET /api/forms/:id/submissions error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

forms.post('/api/forms/:id/opened', async (c) => {
  try {
    const formId = c.req.param('id');
    const body = await c.req.json<{ lineUserId?: string; friendId?: string }>();
    const friend = body.friendId
      ? await getFriendById(c.env.DB, body.friendId)
      : body.lineUserId
        ? await getFriendByLineUserId(c.env.DB, body.lineUserId)
        : null;
    await c.env.DB.prepare(
      'INSERT INTO form_opens (id, form_id, friend_id, friend_name, opened_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(crypto.randomUUID(), formId, friend?.id ?? null, friend?.display_name ?? null, jstNow()).run();
    return c.json({ success: true });
  } catch (err) {
    console.error('POST /api/forms/:id/opened error:', err);
    return c.json({ success: true });
  }
});

forms.post('/api/forms/:id/partial', async (c) => {
  try {
    const formId = c.req.param('id');
    const body = await c.req.json<{ lineUserId?: string; friendId?: string; data?: Record<string, unknown> }>();
    const friend = body.friendId
      ? await getFriendById(c.env.DB, body.friendId)
      : body.lineUserId
        ? await getFriendByLineUserId(c.env.DB, body.lineUserId)
        : null;
    if (!friend) return c.json({ success: false, error: 'Friend not found' }, 404);
    const existingMeta = friend.metadata ? JSON.parse(friend.metadata) : {};
    const merged = { ...existingMeta, ...body.data };
    await c.env.DB.prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(merged), jstNow(), friend.id).run();
    return c.json({ success: true });
  } catch (err) {
    console.error('POST /api/forms/:id/partial error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

forms.post('/api/forms/:id/submit', async (c) => {
  try {
    const formId = c.req.param('id');
    const form = await getFormById(c.env.DB, formId);
    if (!form) return c.json({ success: false, error: 'Form not found' }, 404);
    if (!form.is_active) return c.json({ success: false, error: 'This form is no longer accepting responses' }, 400);

    const body = await c.req.json<{
      lineUserId?: string;
      friendId?: string;
      data?: Record<string, unknown>;
      responses?: Record<string, unknown>;
      _skipWebhook?: boolean;
      trackedLinkId?: string;
      idToken?: string;
    }>();

    const submissionData = body.data ?? body.responses ?? {};

    const fields = JSON.parse(form.fields || '[]') as Array<{ name: string; label: string; type: string; required?: boolean }>;
    for (const field of fields) {
      if (field.required) {
        const val = submissionData[field.name];
        if (val === undefined || val === null || val === '') {
          return c.json({ success: false, error: `${field.label} は必須項目です` }, 400);
        }
      }
    }

    let friendId: string | null = body.friendId ?? null;
    if (!friendId && body.lineUserId) {
      const friend = await getFriendByLineUserId(c.env.DB, body.lineUserId);
      if (friend) friendId = friend.id;
    }

    delete submissionData._webhookVerified;
    const skipWebhook = Boolean(body._skipWebhook);
    delete submissionData._skipWebhook;
    let webhookData: Record<string, unknown> | null = null;
    if (form.on_submit_webhook_url && !skipWebhook) {
      const webhookResult = await callFormWebhook(form, submissionData);
      webhookData = webhookResult.data as Record<string, unknown> | null;
      if (!webhookResult.passed) {
        if (form.on_submit_webhook_fail_message && friendId) {
          const friend = await getFriendById(c.env.DB, friendId);
          if (friend?.line_user_id) {
            try {
              const { LineClient } = await import('@line-crm/line-sdk');
              let accessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
              if ((friend as unknown as Record<string, unknown>).line_account_id) {
                const { getLineAccountById } = await import('@line-crm/db');
                const account = await getLineAccountById(c.env.DB, (friend as unknown as Record<string, unknown>).line_account_id as string);
                if (account) accessToken = account.channel_access_token;
              }
              const lineClient = new LineClient(accessToken);
              await lineClient.pushMessage(friend.line_user_id, [{ type: 'text', text: form.on_submit_webhook_fail_message }]);
              await c.env.DB.prepare(`INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, source, created_at) VALUES (?, ?, 'outgoing', 'text', ?, NULL, NULL, 'auto_reply', ?)`)
                .bind(crypto.randomUUID(), friend.id, form.on_submit_webhook_fail_message, jstNow()).run();
            } catch (e) { console.error('Failed to send webhook fail message:', e); }
          }
        }
        const submission = await createFormSubmission(c.env.DB, { formId, friendId: friendId || null, data: JSON.stringify({ ...submissionData, _webhookResult: webhookResult.data }) });
        return c.json({ success: true, data: { ...serializeSubmission(submission), webhookPassed: false, webhookData: webhookResult.data } }, 201);
      }
    }

    const submission = await createFormSubmission(c.env.DB, {
      formId,
      friendId: friendId || null,
      data: JSON.stringify(submissionData),
    });

    if (friendId) {
      const db = c.env.DB;
      const now = jstNow();

      let rewardTemplate: import('@line-crm/db').MessageTemplate | null = null;
      {
        const { getFriendById, getTrackedLinkById, getMessageTemplateById } = await import('@line-crm/db');
        const { resolveRewardTemplate } = await import('../services/reward-resolver.js');
        rewardTemplate = await resolveRewardTemplate(db, { friendId, requestedTrackedLinkId: body.trackedLinkId ?? null }, { getFriendById, getTrackedLinkById, getMessageTemplateById });
      }

      const sideEffects: Promise<unknown>[] = [];

      if (form.save_to_metadata) {
        sideEffects.push((async () => {
          const friend = await getFriendById(db, friendId!);
          if (!friend) return;
          const existing = JSON.parse(friend.metadata || '{}') as Record<string, unknown>;
          await db.prepare(`UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?`)
            .bind(JSON.stringify({ ...existing, ...submissionData }), now, friendId).run();
        })());
      }

      if (form.on_submit_tag_id) sideEffects.push(addTagToFriend(db, friendId, form.on_submit_tag_id));
      if (form.on_submit_scenario_id) sideEffects.push(enrollFriendInScenario(db, friendId, form.on_submit_scenario_id));

      if (webhookData?.join_url) {
        sideEffects.push((async () => {
          const friend = await getFriendById(db, friendId!);
          if (!friend?.line_user_id) return;
          const { LineClient } = await import('@line-crm/line-sdk');
          let accessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
          if ((friend as unknown as Record<string, unknown>).line_account_id) {
            const { getLineAccountById } = await import('@line-crm/db');
            const account = await getLineAccountById(db, (friend as unknown as Record<string, unknown>).line_account_id as string);
            if (account) accessToken = account.channel_access_token;
          }
          const lineClient = new LineClient(accessToken);
          const joinUrl = String(webhookData!.join_url);
          const meetFlex = {
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: 'ヒアリングの準備ができました', size: 'md', weight: 'bold', color: '#1e293b' }], paddingAll: '20px', backgroundColor: '#f0f9ff' },
            body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: 'アンケートありがとうございます。続けて短いヒアリングにご協力ください。', size: 'sm', color: '#475569', wrap: true }], paddingAll: '20px' },
            footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#4CAF50', action: { type: 'uri', label: 'ヒアリングを始める', uri: joinUrl } }], paddingAll: '16px' },
          };
          await lineClient.pushMessage(friend.line_user_id, [{ type: 'flex', altText: 'ヒアリングの準備ができました', contents: meetFlex }]);
          await db.prepare(`INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, source, created_at) VALUES (?, ?, 'outgoing', 'flex', ?, NULL, NULL, 'auto_reply', ?)`)
            .bind(crypto.randomUUID(), friend.id, JSON.stringify(meetFlex), jstNow()).run();
        })());
      }

      // 自動返信メッセージ
      sideEffects.push((async () => {
        const friend = await getFriendById(db, friendId!);
        if (!friend?.line_user_id) return;
        const { LineClient } = await import('@line-crm/line-sdk');
        let accessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
        if ((friend as unknown as Record<string, unknown>).line_account_id) {
          const { getLineAccountById } = await import('@line-crm/db');
          const account = await getLineAccountById(db, (friend as unknown as Record<string, unknown>).line_account_id as string);
          if (account) accessToken = account.channel_access_token;
        }
        const lineClient = new LineClient(accessToken);
        const { buildMessage, expandVariables } = await import('../services/step-delivery.js');
        const { resolveMetadata, messageToLogPayload } = await import('../services/step-delivery.js');
        const resolvedMeta = await resolveMetadata(c.env.DB, {
          user_id: (friend as unknown as Record<string, string | null>).user_id,
          metadata: (friend as unknown as Record<string, string | null>).metadata,
        });
        const friendData = {
          id: friend.id,
          display_name: friend.display_name,
          user_id: (friend as unknown as Record<string, string | null>).user_id,
          ref_code: (friend as unknown as Record<string, string | null>).ref_code,
          metadata: resolvedMeta,
        };
        const apiOrigin = new URL(c.req.url).origin;
        const { buildRewardMessage } = await import('../services/reward-message.js');
        const rewardFromTrackedLink = buildRewardMessage(rewardTemplate, friend.display_name);

        const messages: ReturnType<typeof buildMessage>[] = [];

        if (rewardFromTrackedLink) {
          messages.push(rewardFromTrackedLink as ReturnType<typeof buildMessage>);
        } else if (form.on_submit_message_type && form.on_submit_message_content) {
          const expanded = expandVariables(form.on_submit_message_content, friendData, apiOrigin);
          messages.push(buildMessage(form.on_submit_message_type, expanded));
        } else {
          // ─── 故障申請受付完了メッセージ ───────────────────────────
          const responses = submissionData as Record<string, unknown>;
          const receiptNo = `#${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${submission.id.slice(0, 6).toUpperCase()}`;
          const failureDesc = String(responses.failure_description ?? '');
          const symptomGuide = getSymptomMessage(failureDesc);

          const confirmText = [
            '【故障申請受付完了】',
            `受付番号：${receiptNo}`,
            '',
            '以下の内容で受け付けました。',
            `・製品：${responses.product_name ?? 'Shaken'}`,
            `・シリアル番号：${responses.serial_number ?? '-'}`,
            `・症状：${failureDesc || '-'}`,
            '',
            '故障症状に合わせた動画の撮影をお願いしております。',
            '動画の撮影が難しい場合はご連絡ください。',
            '',
            symptomGuide,
            '',
            '動画の撮影方法に関しましては担当者が故障症状を確認した後にご連絡させていただきます。',
          ].join('\n');

          messages.push(buildMessage('text', confirmText));
          // ────────────────────────────────────────────────────────
        }

        await lineClient.pushMessage(friend.line_user_id, messages);

        const sentAt = jstNow();
        for (const m of messages) {
          const payload = messageToLogPayload(m);
          await db.prepare(`INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, source, created_at) VALUES (?, ?, 'outgoing', ?, ?, NULL, NULL, 'auto_reply', ?)`)
            .bind(crypto.randomUUID(), friend.id, payload.messageType, payload.content, sentAt).run();
        }
      })());

      // Telegram通知
      if (c.env.TELEGRAM_BOT_TOKEN && c.env.TELEGRAM_CHAT_ID) {
        sideEffects.push((async () => {
          try {
            const responses = submissionData as Record<string, unknown>;
            const receiptNo = `#${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${submission.id.slice(0, 6).toUpperCase()}`;
            const friend = friendId ? await getFriendById(c.env.DB, friendId) : null;
            const msg = [
              '🔔 【新規故障申請】',
              `受付番号：${receiptNo}`,
              `申請者：${friend?.display_name ?? '不明'}`,
              '',
              `製品：${responses.product_name ?? 'Shaken'}`,
              `シリアル番号：${responses.serial_number ?? '-'}`,
              `会員ID：${responses.member_id ?? '-'}`,
              `故障症状：${responses.failure_description ?? '-'}`,
              '',
              '【配送先】',
              `〒${responses.postal_code ?? '-'}`,
              `${responses.address ?? '-'}`,
              `宛名：${responses.recipient_name ?? '-'}`,
              `電話：${responses.phone ?? '-'}`,
            ].join('\n');
            await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: c.env.TELEGRAM_CHAT_ID, text: msg }),
            });
          } catch (e) { console.error('Telegram notification failed:', e); }
        })());
      }

      if (sideEffects.length > 0) {
        const results = await Promise.allSettled(sideEffects);
        for (const r of results) {
          if (r.status === 'rejected') console.error('Form side-effect failed:', r.reason);
        }
      }
    }

    return c.json({ success: true, data: serializeSubmission(submission) }, 201);
  } catch (err) {
    console.error('POST /api/forms/:id/submit error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

async function callFormWebhook(form: DbForm, submissionData: Record<string, unknown>): Promise<{ passed: boolean; data: unknown }> {
  if (!form.on_submit_webhook_url) return { passed: true, data: null };
  try {
    let url = form.on_submit_webhook_url;
    for (const [key, value] of Object.entries(submissionData)) {
      url = url.replace(`{${key}}`, encodeURIComponent(String(value ?? '')));
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (form.on_submit_webhook_headers) {
      try { Object.assign(headers, JSON.parse(form.on_submit_webhook_headers)); } catch { /* ignore */ }
    }
    const isGet = form.on_submit_webhook_url.includes('{');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { method: isGet ? 'GET' : 'POST', headers, signal: controller.signal, ...(isGet ? {} : { body: JSON.stringify(submissionData) }) });
    clearTimeout(timeout);
    if (!res.ok) return { passed: false, data: { error: `HTTP ${res.status}` } };
    const data = await res.json() as Record<string, unknown>;
    const eligible = data.eligible ?? (data.data as Record<string, unknown> | undefined)?.eligible ?? data.success;
    return { passed: Boolean(eligible), data };
  } catch (err) {
    console.error('Form webhook error:', err);
    return { passed: false, data: { error: String(err) } };
  }
}

export { forms };
