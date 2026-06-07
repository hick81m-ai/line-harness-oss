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
  '電源が入らない': `電源が入らない症状の場合、以下の手順で動画をお送りください。
①充電器を差し込んだ状態で、液晶画面の電池残量が映るようにしながら、Mボタンを15秒間長押ししてください。
※長押し中に数値が一時的に変化する場合がありますので、その変化もあわせて撮影してください。
②その後、電源ケーブルを抜いて電源ボタンを押し、電源が入らない状態を撮影してください。`,

  '充電ができない': `充電ができない症状の場合、Shakenに付属の電源ケーブル2種類（USBタイプ・Type-C）をそれぞれ使用し、充電ができないことが確認できる動画をお送りください。使用しているアダプタの仕様がわかるお写真も合わせてご送付ください。`,

  '温かくならない': `温かくならない症状・体感に左右差がある症状・異音がする症状の場合、Shakenの「ボディメイクモード」を起動し、本体を未装着の状態でテーブルの上に置いて、装着部側を約1分間作動させた動画をお送りください。
※本体とエアバッグの両方が映っている状態で約1分間撮影してください。`,

  '振動がない/弱い': `振動がない/弱い症状の場合、Shakenの「ボディメイクモード」を起動し、本体を未装着の状態でテーブルの上に置いて、装着部側を約1分間作動させた動画をお送りください。
※本体とエアバッグの両方が映っている状態で約1分間撮影してください。`,

  'ベルトの空気が入らない': `ベルトの空気が入らない症状の場合、膨張モード作動時の状態を動画でお送りください。`,

  '体感に左右差がある': `温かくならない症状・体感に左右差がある症状・異音がする症状の場合、Shakenの「ボディメイクモード」を起動し、本体を未装着の状態でテーブルの上に置いて、装着部側を約1分間作動させた動画をお送りください。
※本体とエアバッグの両方が映っている状態で約1分間撮影してください。`,

  '異音がする': `温かくならない症状・体感に左右差がある症状・異音がする症状の場合、Shakenの「ボディメイクモード」を起動し、本体を未装着の状態でテーブルの上に置いて、装着部側を約1分間作動させた動画をお送りください。
※本体とエアバッグの両方が映っている状態で約1分間撮影してください。`,

  '破損・傷がある': `破損・傷がある症状の場合、該当箇所が明確に確認できる写真をお送りください。`,
};

function getSymptomMessages(failureDescription: string): string[] {
  const messages: string[] = [];
  const seen = new Set<string>();
  for (const [symptom, message] of Object.entries(SYMPTOM_MESSAGES)) {
    if (failureDescription.includes(symptom) && !seen.has(message)) {
      messages.push(message);
      seen.add(message);
    }
  }
  if (messages.length === 0) {
    messages.push('症状がわかる動画または写真をお送りください。');
  }
  messages.push('⚠️ 動画・写真には必ずシリアル番号を映してください。\nシリアル番号の撮影がない場合、審査ができない可能性がございます。');
  return messages;
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
const symptomGuides = getSymptomMessages(failureDesc);

const flexContents = [
  // 受付番号
  {
    type: 'box', layout: 'vertical', margin: 'md',
    contents: [
      { type: 'text', text: '受付番号', size: 'xxs', color: '#64748b' },
      { type: 'text', text: receiptNo, size: 'md', color: '#1e293b', weight: 'bold' },
    ],
  },
  { type: 'separator', margin: 'lg' },
  // 申請内容
  {
    type: 'box', layout: 'vertical', margin: 'lg',
    contents: [
      { type: 'text', text: '申請内容', size: 'xs', color: '#64748b', weight: 'bold' },
      { type: 'text', text: `製品：${responses.product_name ?? 'Shaken'}`, size: 'sm', color: '#1e293b', margin: 'sm', wrap: true },
      { type: 'text', text: `シリアル番号：${responses.serial_number ?? '-'}`, size: 'sm', color: '#1e293b', margin: 'sm', wrap: true },
      { type: 'text', text: `症状：${failureDesc || '-'}`, size: 'sm', color: '#1e293b', margin: 'sm', wrap: true },
    ],
  },
  { type: 'separator', margin: 'lg' },
  // 配送先
  {
    type: 'box', layout: 'vertical', margin: 'lg',
    contents: [
      { type: 'text', text: '配送先情報', size: 'xs', color: '#64748b', weight: 'bold' },
      { type: 'text', text: `〒${responses.postal_code ?? '-'}`, size: 'sm', color: '#1e293b', margin: 'sm', wrap: true },
      { type: 'text', text: String(responses.address ?? '-'), size: 'sm', color: '#1e293b', margin: 'sm', wrap: true },
      { type: 'text', text: `宛名：${responses.recipient_name ?? '-'}`, size: 'sm', color: '#1e293b', margin: 'sm', wrap: true },
      { type: 'text', text: `電話：${responses.phone ?? '-'}`, size: 'sm', color: '#1e293b', margin: 'sm', wrap: true },
    ],
  },
  { type: 'separator', margin: 'lg' },
  // 動画撮影案内
  {
    type: 'box', layout: 'vertical', margin: 'lg',
    contents: [
      { type: 'text', text: '動画撮影のお願い', size: 'xs', color: '#64748b', weight: 'bold' },
      ...symptomGuides.map(guide => ({
        type: 'text' as const, text: `・${guide}`, size: 'sm' as const, color: '#1e293b', margin: 'sm' as const, wrap: true,
      })),
      { type: 'text', text: '動画の撮影が難しい場合はご連絡ください。', size: 'sm', color: '#64748b', margin: 'md', wrap: true },
      { type: 'text', text: '撮影方法は担当者が症状確認後にご連絡いたします。', size: 'sm', color: '#64748b', margin: 'sm', wrap: true },
    ],
  },
];

const resultFlex = {
  type: 'bubble',
  size: 'giga',
  header: {
    type: 'box',
    layout: 'vertical',
    contents: [
      { type: 'text', text: '✅ 故障申請受付完了', size: 'lg', weight: 'bold', color: '#1e293b' },
      { type: 'text', text: `${friend.display_name || ''}さんの申請を受け付けました`, size: 'xs', color: '#64748b', margin: 'sm' },
    ],
    paddingAll: '20px',
    backgroundColor: '#f0fdf4',
  },
  body: {
    type: 'box',
    layout: 'vertical',
    contents: flexContents,
    paddingAll: '20px',
  },
};

messages.push(buildMessage('flex', JSON.stringify(resultFlex)));
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
      
// Googleスプレッドシート記録
      if (c.env.GAS_WEBHOOK_URL) {
        sideEffects.push((async () => {
          try {
            const responses = submissionData as Record<string, unknown>;
            const receiptNo = `#${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${submission.id.slice(0, 6).toUpperCase()}`;
            const friend = friendId ? await getFriendById(c.env.DB, friendId) : null;
            const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
            await fetch(c.env.GAS_WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                receivedAt: now,
                receiptNo: receiptNo,
                friendName: friend?.display_name ?? '',
                memberId: responses.member_id ?? '',
                memberName: responses.member_name ?? '',
                serialNumber: responses.serial_number ?? '',
                failureDescription: responses.failure_description ?? '',
                symptomDetail: responses.symptom_detail ?? '',
                postalCode: responses.postal_code ?? '',
                address: responses.address ?? '',
                recipientName: responses.recipient_name ?? '',
                phone: responses.phone ?? '',
                remarks: responses.remarks ?? '',
              }),
            });
          } catch (e) {
            console.error('GAS webhook failed:', e);
          }
        })());
      }
      
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
              `詳細の状況：${responses.symptom_detail ? String(responses.symptom_detail) : 'なし'}`,
              '',
              '【配送先】',
              `〒${responses.postal_code ?? '-'}`,
              `${responses.address ?? '-'}`,
              `宛名：${responses.recipient_name ?? '-'}`,
              `電話：${responses.phone ?? '-'}`,
              `備考：${responses.remarks ? String(responses.remarks) : 'なし'}`,
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

// ─── 修理管理用ヘルパー ─────────────────────────────────────────

async function getSubmissionWithFriend(db: D1Database, formId: string, submissionId: string) {
  const row = await db
    .prepare(
      `SELECT fs.*, f.lineUserId as line_user_id_friend
       FROM form_submissions fs
       LEFT JOIN friends f ON f.id = fs.friend_id
       WHERE fs.id = ? AND fs.form_id = ?`,
    )
    .bind(submissionId, formId)
    .first<Record<string, unknown>>();
  return row ?? null;
}

function buildReceiptNumber(submissionId: string, createdAt: string) {
  const date = createdAt ? createdAt.slice(0, 10).replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `#${date}-${submissionId.slice(0, 6).toUpperCase()}`;
}

function buildReplyTemplate(type: string, data: Record<string, unknown>, submissionId: string, createdAt: string): string {
  const memberName = String(data.member_name ?? data.recipient_name ?? '');
  const receiptNumber = buildReceiptNumber(submissionId, createdAt);
  const failureDesc = String(data.failure_description ?? '');
  const symptomMessages = getSymptomMessages(failureDesc).join('\n\n');

  switch (type) {
    case 'video_request':
      return `${memberName}様

この度はShaken故障申請をいただきありがとうございます。
受付番号：${receiptNumber}

以下の症状について、確認のための動画・写真をLINEにてお送りいただけますでしょうか。

${symptomMessages}

お手数をおかけしますが、よろしくお願いいたします。`;

    case 'return_request_exchange':
      return `${memberName}様

受付番号：${receiptNumber}

動画のご提出ありがとうございました。
内容を確認いたしましたところ、交換対応とさせていただくことになりました。

お手数ですが、現在お使いの製品を下記宛先までご返送ください。

【返送先】
担当者よりお知らせいたします。

ご不明点がございましたら、お気軽にご連絡ください。`;

    case 'return_request_inspection':
      return `${memberName}様

受付番号：${receiptNumber}

動画のご提出ありがとうございました。
内容を確認いたしましたところ、弊社にて詳しく検証させていただく必要がございます。

お手数ですが、現在お使いの製品を下記宛先までご返送ください。

【返送先】
担当者よりお知らせいたします。

検証結果が出次第、あらためてご連絡いたします。
ご不明点がございましたら、お気軽にご連絡ください。`;

    case 'shipping_complete':
      return `${memberName}様

受付番号：${receiptNumber}

交換品を発送いたしましたのでお知らせいたします。
ヤマト運輸にてお荷物の追跡をご確認ください。

引き続きShakenをよろしくお願いいたします。`;

    default:
      return '';
  }
}

// ─── 1. ステータス更新API ────────────────────────────────────────
forms.patch('/api/forms/:formId/submissions/:submissionId/status', async (c) => {
  const apiKey = c.req.header('Authorization')?.replace('Bearer ', '');
  if (apiKey !== c.env.API_KEY) return c.json({ success: false, error: 'Unauthorized' }, 401);
  try {
    const { formId, submissionId } = c.req.param();
    const body = await c.req.json<{
      our_status?: string;
      hq_status?: string;
      return_type?: string;
      admin_memo?: string;
    }>();

    const row = await getSubmissionWithFriend(c.env.DB, formId, submissionId);
    if (!row) return c.json({ success: false, error: 'Submission not found' }, 404);

    const sets: string[] = [];
    const bindings: unknown[] = [];
    if (body.our_status !== undefined) { sets.push('our_status = ?'); bindings.push(body.our_status); }
    if (body.hq_status !== undefined) { sets.push('hq_status = ?'); bindings.push(body.hq_status); }
    if (body.return_type !== undefined) { sets.push('return_type = ?'); bindings.push(body.return_type); }
    if (body.admin_memo !== undefined) { sets.push('admin_memo = ?'); bindings.push(body.admin_memo); }

    if (sets.length === 0) return c.json({ success: false, error: 'No fields to update' }, 400);

    bindings.push(submissionId);
    await c.env.DB.prepare(`UPDATE form_submissions SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...bindings)
      .run();

    return c.json({ success: true });
  } catch (err) {
    console.error('PATCH /status error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── 2. 追跡番号登録＋LINE通知API ────────────────────────────────
forms.patch('/api/forms/:formId/submissions/:submissionId/tracking', async (c) => {
  const apiKey = c.req.header('Authorization')?.replace('Bearer ', '');
  if (apiKey !== c.env.API_KEY) return c.json({ success: false, error: 'Unauthorized' }, 401);
  try {
    const { formId, submissionId } = c.req.param();
    const body = await c.req.json<{ type: 'outbound' | 'inbound' | 'hq'; tracking_number: string }>();

    if (!body.type || !body.tracking_number) {
      return c.json({ success: false, error: 'type and tracking_number are required' }, 400);
    }

    const row = await getSubmissionWithFriend(c.env.DB, formId, submissionId);
    if (!row) return c.json({ success: false, error: 'Submission not found' }, 404);

    const col = `tracking_number_${body.type}`;
    const sets = [col + ' = ?'];
    const bindings: unknown[] = [body.tracking_number];

    if (body.type === 'outbound') {
      sets.push('our_status = ?');
      bindings.push('発送済み');
    }

    bindings.push(submissionId);
    await c.env.DB.prepare(`UPDATE form_submissions SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...bindings)
      .run();

    if (body.type === 'outbound') {
      const lineUserId = String(row.line_user_id_friend ?? '');
      if (lineUserId) {
        try {
          const { LineClient } = await import('@line-crm/line-sdk');
          const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
          const flexContent = {
            type: 'bubble',
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                { type: 'text', text: '📦 発送のお知らせ', weight: 'bold', size: 'lg' },
                { type: 'text', text: '交換品を発送しました。', wrap: true, margin: 'md' },
                { type: 'text', text: '追跡番号', weight: 'bold', margin: 'md' },
                { type: 'text', text: body.tracking_number, wrap: true },
                { type: 'text', text: 'ヤマト運輸にてご確認ください。', wrap: true, margin: 'md', color: '#888888', size: 'sm' },
              ],
            },
          };
          await lineClient.pushMessage(lineUserId, [{ type: 'flex', altText: '📦 発送のお知らせ', contents: flexContent }]);
          await c.env.DB.prepare(
            `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, source, created_at) VALUES (?, ?, 'outgoing', 'flex', ?, NULL, NULL, 'admin', ?)`,
          )
            .bind(crypto.randomUUID(), row.friend_id, JSON.stringify(flexContent), jstNow())
            .run();
        } catch (e) {
          console.error('LINE push (tracking) failed:', e);
        }
      }
    }

    return c.json({ success: true });
  } catch (err) {
    console.error('PATCH /tracking error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── 3. 返信テンプレ生成API ──────────────────────────────────────
forms.get('/api/forms/:formId/submissions/:submissionId/reply-template', async (c) => {
  const apiKey = c.req.header('Authorization')?.replace('Bearer ', '');
  if (apiKey !== c.env.API_KEY) return c.json({ success: false, error: 'Unauthorized' }, 401);
  try {
    const { formId, submissionId } = c.req.param();
    const type = c.req.query('type') ?? '';

    const row = await getSubmissionWithFriend(c.env.DB, formId, submissionId);
    if (!row) return c.json({ success: false, error: 'Submission not found' }, 404);

    const data = JSON.parse(String(row.data ?? '{}')) as Record<string, unknown>;
    const template = buildReplyTemplate(type, data, submissionId, String(row.created_at ?? ''));

    if (!template) return c.json({ success: false, error: 'Unknown template type' }, 400);

    return c.json({ success: true, data: { template } });
  } catch (err) {
    console.error('GET /reply-template error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── 4. LINE返信送信API ──────────────────────────────────────────
forms.post('/api/forms/:formId/submissions/:submissionId/send-reply', async (c) => {
  const apiKey = c.req.header('Authorization')?.replace('Bearer ', '');
  if (apiKey !== c.env.API_KEY) return c.json({ success: false, error: 'Unauthorized' }, 401);
  try {
    const { formId, submissionId } = c.req.param();
    const body = await c.req.json<{
      message: string;
      message_type: 'text' | 'flex';
      flex_content?: Record<string, unknown>;
      update_status_to?: string;
    }>();

    if (!body.message) return c.json({ success: false, error: 'message is required' }, 400);

    const row = await getSubmissionWithFriend(c.env.DB, formId, submissionId);
    if (!row) return c.json({ success: false, error: 'Submission not found' }, 404);

    const lineUserId = String(row.line_user_id_friend ?? '');
    if (!lineUserId) return c.json({ success: false, error: 'No LINE user associated' }, 400);

    try {
      const { LineClient } = await import('@line-crm/line-sdk');
      const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
      const msg =
        body.message_type === 'flex' && body.flex_content
          ? { type: 'flex' as const, altText: body.message, contents: body.flex_content }
          : { type: 'text' as const, text: body.message };
      await lineClient.pushMessage(lineUserId, [msg]);
      await c.env.DB.prepare(
        `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, source, created_at) VALUES (?, ?, 'outgoing', ?, ?, NULL, NULL, 'admin', ?)`,
      )
        .bind(crypto.randomUUID(), row.friend_id, body.message_type, body.message_type === 'flex' ? JSON.stringify(body.flex_content) : body.message, jstNow())
        .run();
    } catch (e) {
      console.error('LINE push (send-reply) failed:', e);
    }

    if (body.update_status_to) {
      await c.env.DB.prepare(`UPDATE form_submissions SET our_status = ? WHERE id = ?`)
        .bind(body.update_status_to, submissionId)
        .run();
    }

    return c.json({ success: true });
  } catch (err) {
    console.error('POST /send-reply error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── 5. リマインド送信API ────────────────────────────────────────
forms.post('/api/forms/:formId/submissions/:submissionId/remind', async (c) => {
  const apiKey = c.req.header('Authorization')?.replace('Bearer ', '');
  if (apiKey !== c.env.API_KEY) return c.json({ success: false, error: 'Unauthorized' }, 401);
  try {
    const { formId, submissionId } = c.req.param();

    const row = await getSubmissionWithFriend(c.env.DB, formId, submissionId);
    if (!row) return c.json({ success: false, error: 'Submission not found' }, 404);

    if (row.our_status !== '動画依頼済み') {
      return c.json({ success: false, error: 'our_status must be 動画依頼済み' }, 400);
    }
    if (row.video_reminder_sent_at) {
      return c.json({ success: false, error: 'Reminder already sent' }, 400);
    }

    const lineUserId = String(row.line_user_id_friend ?? '');
    if (!lineUserId) return c.json({ success: false, error: 'No LINE user associated' }, 400);

    const data = JSON.parse(String(row.data ?? '{}')) as Record<string, unknown>;
    const template = buildReplyTemplate('video_request', data, submissionId, String(row.created_at ?? ''));

    try {
      const { LineClient } = await import('@line-crm/line-sdk');
      const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
      await lineClient.pushMessage(lineUserId, [{ type: 'text', text: template }]);
      await c.env.DB.prepare(
        `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, source, created_at) VALUES (?, ?, 'outgoing', 'text', ?, NULL, NULL, 'admin', ?)`,
      )
        .bind(crypto.randomUUID(), row.friend_id, template, jstNow())
        .run();
    } catch (e) {
      console.error('LINE push (remind) failed:', e);
    }

    const now = jstNow();
    await c.env.DB.prepare(`UPDATE form_submissions SET video_reminder_sent_at = ? WHERE id = ?`)
      .bind(now, submissionId)
      .run();

    return c.json({ success: true });
  } catch (err) {
    console.error('POST /remind error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ────────────────────────────────────────────────────────────────

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
