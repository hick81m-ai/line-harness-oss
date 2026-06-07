'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

const FORM_ID = '49a84e34-831c-462c-b801-a30c44d46f57'

const OUR_STATUS_OPTIONS = ['受付済み', '動画依頼済み', '動画受領済み', '返送依頼済み', '返送品受領済み', '発送済み', '追跡番号連絡済み', '完了']
const HQ_STATUS_OPTIONS = ['未申請', '申請済み', '審査中', '承認済み', '本社に返送済み']
const INVENTORY_OPTIONS = ['本社交換品', 'ブライアン新品']

const OUR_STATUS_COLORS: Record<string, string> = {
  '受付済み':        'bg-gray-100 text-gray-700',
  '動画依頼済み':    'bg-blue-100 text-blue-700',
  '動画受領済み':    'bg-cyan-100 text-cyan-700',
  '返送依頼済み':    'bg-orange-100 text-orange-700',
  '返送品受領済み':  'bg-purple-100 text-purple-700',
  '発送済み':        'bg-green-100 text-green-700',
  '追跡番号連絡済み': 'bg-teal-100 text-teal-700',
  '完了':            'bg-emerald-100 text-emerald-800',
}

const HQ_STATUS_COLORS: Record<string, string> = {
  '未申請':       'bg-gray-100 text-gray-600',
  '申請済み':     'bg-blue-100 text-blue-700',
  '審査中':       'bg-yellow-100 text-yellow-700',
  '承認済み':     'bg-green-100 text-green-700',
  '本社に返送済み': 'bg-purple-100 text-purple-700',
}

interface Submission {
  id: string
  formId: string
  friendId: string | null
  friendName: string | null
  data: Record<string, unknown>
  createdAt: string
  our_status?: string
  hq_status?: string
  return_type?: string | null
  tracking_number_inbound?: string | null
  tracking_number_outbound?: string | null
  tracking_number_hq?: string | null
  shipping_cost_inbound?: number | null
  shipping_cost_outbound?: number | null
  shipping_cost_hq?: number | null
  estimated_delivery_date?: string | null
  video_reminder_sent_at?: string | null
  admin_memo?: string | null
  sent_serial_number?: string | null
  hq_tracking_number?: string | null
  inventory_type?: string | null
  reply_notification_sent_at?: string | null
}

interface ReplyTemplate {
  id: string
  name: string
  type: string
  content: string
}

function buildReceiptNumber(sub: Submission): string {
  const date = sub.createdAt.slice(0, 10).replace(/-/g, '')
  return `#${date}-${sub.id.slice(0, 6).toUpperCase()}`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function InfoRow({ label, value }: { label: string; value?: unknown }) {
  const text = value === null || value === undefined || value === '' ? '—' : Array.isArray(value) ? value.join(', ') : String(value)
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 py-2 border-b border-gray-100 last:border-0">
      <dt className="text-xs text-gray-500 pt-0.5">{label}</dt>
      <dd className="text-sm text-gray-900 whitespace-pre-wrap break-words">{text}</dd>
    </div>
  )
}

function StatusBadge({ status, colorMap }: { status: string; colorMap: Record<string, string> }) {
  const cls = colorMap[status] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [onClose])
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-gray-900 text-white text-sm rounded-xl shadow-lg">
      {message}
    </div>
  )
}

const TEMPLATE_TYPES = [
  { type: 'video_request', label: '動画依頼' },
  { type: 'return_request_exchange', label: '返送依頼（交換）' },
  { type: 'return_request_inspection', label: '返送依頼（検証）' },
  { type: 'shipping_complete', label: '発送完了' },
]

export default function RepairDetailClient({ id }: { id: string }) {
  const router = useRouter()
  const submissionId = id

  const [sub, setSub] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  const [ourStatus, setOurStatus] = useState('')
  const [hqStatus, setHqStatus] = useState('')
  const [returnType, setReturnType] = useState('')
  const [saving, setSaving] = useState(false)

  // tracking
  const [trackData, setTrackData] = useState({
    inbound:  { number: '', cost: '', date: '' },
    outbound: { number: '', cost: '', date: '' },
    hq:       { number: '', cost: '', date: '' },
  })
  const [savingTrack, setSavingTrack] = useState<'inbound' | 'outbound' | 'hq' | null>(null)

  // shipping product
  const [sentSerial, setSentSerial] = useState('')
  const [hqTrackNum, setHqTrackNum] = useState('')
  const [inventoryType, setInventoryType] = useState('')
  const [savingShipping, setSavingShipping] = useState(false)

  // reply
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  // memo
  const [memo, setMemo] = useState('')
  const [savingMemo, setSavingMemo] = useState(false)

  // templates
  const [templates, setTemplates] = useState<ReplyTemplate[]>([])
  const [editingTemplates, setEditingTemplates] = useState<Record<string, string>>({})
  const [activeTemplateTab, setActiveTemplateTab] = useState('video_request')
  const [savingTemplate, setSavingTemplate] = useState(false)

  const showToast = useCallback((msg: string) => setToast(msg), [])

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetchApi<{ success: boolean; data: ReplyTemplate[] }>('/api/forms/templates')
      if (res.success) {
        setTemplates(res.data)
        const map: Record<string, string> = {}
        for (const t of res.data) map[t.type] = t.content
        setEditingTemplates(map)
      }
    } catch { /* silent */ }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchApi<{ success: boolean; data: Submission[] }>(
        `/api/forms/${FORM_ID}/submissions`,
      )
      if (res.success) {
        const found = res.data.find((s) => s.id === submissionId)
        if (found) {
          const s = {
            ...found,
            data: typeof found.data === 'string' ? JSON.parse(found.data as string) : found.data,
          }
          setSub(s)
          setOurStatus(s.our_status ?? '受付済み')
          setHqStatus(s.hq_status ?? '未申請')
          setReturnType(s.return_type ?? '')
          setTrackData({
            inbound:  { number: s.tracking_number_inbound ?? '', cost: String(s.shipping_cost_inbound ?? ''), date: '' },
            outbound: { number: s.tracking_number_outbound ?? '', cost: String(s.shipping_cost_outbound ?? ''), date: s.estimated_delivery_date ?? '' },
            hq:       { number: s.tracking_number_hq ?? '', cost: String(s.shipping_cost_hq ?? ''), date: '' },
          })
          setMemo(s.admin_memo ?? '')
          setSentSerial(s.sent_serial_number ?? '')
          setHqTrackNum(s.hq_tracking_number ?? '')
          setInventoryType(s.inventory_type ?? '')
        }
      }
    } catch { /* silent */ }
    setLoading(false)
  }, [submissionId])

  useEffect(() => {
    load()
    loadTemplates()
  }, [load, loadTemplates])

  async function saveStatus() {
    if (!sub) return
    if (ourStatus === '返送依頼済み' && !returnType) {
      showToast('⚠️ 返送種別を先に設定してください')
      return
    }
    setSaving(true)
    try {
      await fetchApi(`/api/forms/${FORM_ID}/submissions/${sub.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ our_status: ourStatus, hq_status: hqStatus, return_type: returnType || undefined }),
      })
      showToast('✅ ステータスを更新しました')
      await load()
    } catch { showToast('❌ 更新に失敗しました') }
    setSaving(false)
  }

  async function saveTracking(type: 'inbound' | 'outbound' | 'hq') {
    if (!sub) return
    const item = trackData[type]
    if (!item.number.trim()) return
    setSavingTrack(type)
    try {
      const payload: Record<string, unknown> = {
        type,
        tracking_number: item.number.trim(),
      }
      if (item.cost !== '' && item.cost !== 'null') payload.shipping_cost = Number(item.cost)
      if (item.date) payload.estimated_delivery_date = item.date
      await fetchApi(`/api/forms/${FORM_ID}/submissions/${sub.id}/tracking`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      const msg = type === 'outbound' ? '✅ 保存してLINEに通知しました' : '✅ 追跡番号を保存しました'
      showToast(msg)
      await load()
    } catch { showToast('❌ 保存に失敗しました') }
    setSavingTrack(null)
  }

  async function saveShipping() {
    if (!sub) return
    setSavingShipping(true)
    try {
      await fetchApi(`/api/forms/${FORM_ID}/submissions/${sub.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          sent_serial_number: sentSerial,
          hq_tracking_number: hqTrackNum,
          inventory_type: inventoryType,
        }),
      })
      showToast('✅ 発送製品記録を保存しました')
    } catch { showToast('❌ 保存に失敗しました') }
    setSavingShipping(false)
  }

  async function loadTemplate(type: string) {
    if (!sub) return
    try {
      const res = await fetchApi<{ success: boolean; data: { template: string } }>(
        `/api/forms/${FORM_ID}/submissions/${sub.id}/reply-template?type=${type}`,
      )
      if (res.success) setReplyText(res.data.template)
    } catch { showToast('❌ テンプレ取得に失敗しました') }
  }

  async function sendReply() {
    if (!sub || !replyText.trim()) return
    setSending(true)
    try {
      await fetchApi(`/api/forms/${FORM_ID}/submissions/${sub.id}/send-reply`, {
        method: 'POST',
        body: JSON.stringify({ message: replyText.trim(), message_type: 'text' }),
      })
      showToast('送信しました ✅')
      setReplyText('')
    } catch { showToast('❌ 送信に失敗しました') }
    setSending(false)
  }

  async function saveMemo() {
    if (!sub) return
    setSavingMemo(true)
    try {
      await fetchApi(`/api/forms/${FORM_ID}/submissions/${sub.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ admin_memo: memo }),
      })
      showToast('✅ メモを保存しました')
    } catch { showToast('❌ 保存に失敗しました') }
    setSavingMemo(false)
  }

  async function saveTemplate() {
    setSavingTemplate(true)
    try {
      const content = editingTemplates[activeTemplateTab] ?? ''
      await fetchApi(`/api/forms/templates/${activeTemplateTab}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      })
      showToast('✅ テンプレを保存しました')
      await loadTemplates()
    } catch { showToast('❌ 保存に失敗しました') }
    setSavingTemplate(false)
  }

  if (loading) {
    return (
      <div>
        <Header title="故障申請詳細" />
        <div className="space-y-4 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 h-32" />
          ))}
        </div>
      </div>
    )
  }

  if (!sub) {
    return (
      <div>
        <Header title="故障申請詳細" />
        <div className="bg-white rounded-lg border border-gray-200 p-10 text-center text-gray-400">
          申請が見つかりません
          <br />
          <button onClick={() => router.push('/repairs')} className="mt-4 text-sm text-[#06C755] hover:underline">
            一覧に戻る
          </button>
        </div>
      </div>
    )
  }

  const d = sub.data

  return (
    <div>
      <Header
        title="故障申請詳細"
        description={buildReceiptNumber(sub)}
        action={
          <button
            onClick={() => router.push('/repairs')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← 一覧に戻る
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 左カラム */}
        <div className="space-y-4">
          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">基本情報</h2>
            <dl>
              <InfoRow label="受付番号" value={buildReceiptNumber(sub)} />
              <InfoRow label="申請日時" value={formatDateTime(sub.createdAt)} />
              <InfoRow label="LINE名" value={sub.friendName} />
              <InfoRow label="会員名" value={d.member_name} />
              <InfoRow label="会員ID" value={d.member_id} />
              <InfoRow label="シリアル番号" value={d.serial_number} />
            </dl>
          </section>

          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">症状・詳細</h2>
            <dl>
              <InfoRow label="故障症状" value={d.failure_description} />
              <InfoRow label="症状詳細" value={d.symptom_detail} />
              <InfoRow label="備考" value={d.remarks} />
            </dl>
          </section>

          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">配送先</h2>
            <dl>
              <InfoRow label="郵便番号" value={d.postal_code ? `〒${String(d.postal_code)}` : undefined} />
              <InfoRow label="住所" value={d.address} />
              <InfoRow label="宛名" value={d.recipient_name} />
              <InfoRow label="電話番号" value={d.phone} />
            </dl>
          </section>
        </div>

        {/* 右カラム */}
        <div className="space-y-4">
          {/* ステータス管理 */}
          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">ステータス管理</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">弊社ステータス</label>
                <div className="flex gap-2">
                  <select
                    value={ourStatus}
                    onChange={(e) => setOurStatus(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {OUR_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <StatusBadge status={ourStatus} colorMap={OUR_STATUS_COLORS} />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">本社ステータス</label>
                <div className="flex gap-2">
                  <select
                    value={hqStatus}
                    onChange={(e) => setHqStatus(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {HQ_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <StatusBadge status={hqStatus} colorMap={HQ_STATUS_COLORS} />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">返送種別</label>
                <div className="flex gap-4 items-center">
                  {[
                    { value: 'exchange', label: '交換確定' },
                    { value: 'inspection', label: '弊社検証' },
                    { value: '', label: '未設定' },
                  ].map((opt) => (
                    <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="return_type"
                        value={opt.value}
                        checked={returnType === opt.value}
                        onChange={() => setReturnType(opt.value)}
                        className="accent-green-600"
                      />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
                {ourStatus === '返送依頼済み' && !returnType && (
                  <p className="mt-1 text-xs text-orange-600">⚠️ 返送依頼済みにする場合は返送種別を設定してください</p>
                )}
              </div>

              <button
                onClick={saveStatus}
                disabled={saving}
                className="w-full py-2 rounded-lg bg-[#06C755] text-white text-sm font-medium hover:bg-[#05b34b] disabled:opacity-50 transition-colors"
              >
                {saving ? '更新中...' : '更新'}
              </button>
            </div>
          </section>

          {/* 追跡番号 */}
          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">追跡番号</h2>
            <div className="space-y-4">
              {([
                { key: 'inbound' as const, label: '受信追跡番号（ユーザー→弊社）', costLabel: '着払い料金（円）', btnLabel: '保存' },
                { key: 'outbound' as const, label: '発送追跡番号（弊社→ユーザー）', costLabel: '送料（円）', btnLabel: '保存して通知' },
                { key: 'hq' as const, label: '本社追跡番号（弊社→本社）', costLabel: '送料（円）', btnLabel: '保存' },
              ] as const).map((item) => (
                <div key={item.key} className="border border-gray-100 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-gray-500 font-medium">{item.label}</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={trackData[item.key].number}
                      onChange={(e) => setTrackData((prev) => ({ ...prev, [item.key]: { ...prev[item.key], number: e.target.value } }))}
                      placeholder="追跡番号"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <input
                      type="number"
                      value={trackData[item.key].cost === 'null' ? '' : trackData[item.key].cost}
                      onChange={(e) => setTrackData((prev) => ({ ...prev, [item.key]: { ...prev[item.key], cost: e.target.value } }))}
                      placeholder={item.costLabel}
                      className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <label className="text-xs text-gray-500 whitespace-nowrap">お届け予定日</label>
                    <input
                      type="date"
                      value={trackData[item.key].date}
                      onChange={(e) => setTrackData((prev) => ({ ...prev, [item.key]: { ...prev[item.key], date: e.target.value } }))}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <button
                      onClick={() => saveTracking(item.key)}
                      disabled={savingTrack === item.key || !trackData[item.key].number.trim()}
                      className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-40 ${
                        item.key === 'outbound'
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-800 text-white hover:bg-gray-700'
                      }`}
                    >
                      {savingTrack === item.key ? '保存中...' : item.btnLabel}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 発送製品記録 */}
          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">発送製品記録</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">送付シリアル番号</label>
                <input
                  type="text"
                  value={sentSerial}
                  onChange={(e) => setSentSerial(e.target.value)}
                  placeholder="シリアル番号を入力"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">本社発行追跡番号</label>
                <input
                  type="text"
                  value={hqTrackNum}
                  onChange={(e) => setHqTrackNum(e.target.value)}
                  placeholder="本社発行の追跡番号"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">使用在庫区分</label>
                <select
                  value={inventoryType}
                  onChange={(e) => setInventoryType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">未選択</option>
                  {INVENTORY_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={saveShipping}
                disabled={savingShipping}
                className="w-full py-2 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                {savingShipping ? '保存中...' : '保存'}
              </button>
            </div>
          </section>

          {/* 返信エリア */}
          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">返信エリア</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              {TEMPLATE_TYPES.map((t) => (
                <button
                  key={t.type}
                  onClick={() => loadTemplate(t.type)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={8}
              placeholder="テンプレボタンを押すか、直接入力してください"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
            />
            <button
              onClick={sendReply}
              disabled={sending || !replyText.trim()}
              className="mt-2 w-full py-2 rounded-lg bg-[#06C755] text-white text-sm font-medium hover:bg-[#05b34b] disabled:opacity-40 transition-colors"
            >
              {sending ? '送信中...' : 'LINEに送信'}
            </button>
          </section>

          {/* テンプレ編集 */}
          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">返信テンプレ編集</h2>
            <p className="text-xs text-gray-400 mb-3">
              変数：<code className="bg-gray-100 px-1 rounded">{'{name}'}</code> 会員名
              <code className="bg-gray-100 px-1 rounded">{'{receipt_number}'}</code> 受付番号
              <code className="bg-gray-100 px-1 rounded">{'{symptom_guide}'}</code> 症状別案内
            </p>
            <div className="flex gap-1 mb-3 flex-wrap">
              {TEMPLATE_TYPES.map((t) => (
                <button
                  key={t.type}
                  onClick={() => setActiveTemplateTab(t.type)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTemplateTab === t.type
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              value={editingTemplates[activeTemplateTab] ?? ''}
              onChange={(e) => setEditingTemplates((prev) => ({ ...prev, [activeTemplateTab]: e.target.value }))}
              rows={10}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y font-mono"
            />
            <button
              onClick={saveTemplate}
              disabled={savingTemplate}
              className="mt-2 w-full py-2 rounded-lg bg-gray-600 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              {savingTemplate ? '保存中...' : 'テンプレを保存'}
            </button>
          </section>

          {/* 管理メモ */}
          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">管理メモ</h2>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={4}
              placeholder="社内メモ（ユーザーには表示されません）"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
            />
            <button
              onClick={saveMemo}
              disabled={savingMemo}
              className="mt-2 w-full py-2 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              {savingMemo ? '保存中...' : '保存'}
            </button>
          </section>
        </div>
      </div>

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}
