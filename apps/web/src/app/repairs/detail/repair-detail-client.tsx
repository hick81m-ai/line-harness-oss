'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

const FORM_ID = '49a84e34-831c-462c-b801-a30c44d46f57'

const OUR_STATUS_OPTIONS = ['受付済み', '動画依頼済み', '動画受領済み', '返送依頼済み', '返送受領済み', '発送済み', '完了']
const HQ_STATUS_OPTIONS = ['未申請', '申請済み', '審査中', '承認済み', '本社に返送済み']

const OUR_STATUS_COLORS: Record<string, string> = {
  '受付済み':    'bg-gray-100 text-gray-700',
  '動画依頼済み': 'bg-blue-100 text-blue-700',
  '動画受領済み': 'bg-cyan-100 text-cyan-700',
  '返送依頼済み': 'bg-orange-100 text-orange-700',
  '返送受領済み': 'bg-purple-100 text-purple-700',
  '発送済み':    'bg-green-100 text-green-700',
  '完了':       'bg-emerald-100 text-emerald-800',
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
  video_reminder_sent_at?: string | null
  admin_memo?: string | null
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

  const [trackInbound, setTrackInbound] = useState('')
  const [trackOutbound, setTrackOutbound] = useState('')
  const [trackHq, setTrackHq] = useState('')
  const [savingTrack, setSavingTrack] = useState<'inbound' | 'outbound' | 'hq' | null>(null)

  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  const [memo, setMemo] = useState('')
  const [savingMemo, setSavingMemo] = useState(false)

  const showToast = useCallback((msg: string) => setToast(msg), [])

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
          setTrackInbound(s.tracking_number_inbound ?? '')
          setTrackOutbound(s.tracking_number_outbound ?? '')
          setTrackHq(s.tracking_number_hq ?? '')
          setMemo(s.admin_memo ?? '')
        }
      }
    } catch { /* silent */ }
    setLoading(false)
  }, [submissionId])

  useEffect(() => { load() }, [load])

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
    const number = type === 'inbound' ? trackInbound : type === 'outbound' ? trackOutbound : trackHq
    if (!number.trim()) return
    setSavingTrack(type)
    try {
      await fetchApi(`/api/forms/${FORM_ID}/submissions/${sub.id}/tracking`, {
        method: 'PATCH',
        body: JSON.stringify({ type, tracking_number: number.trim() }),
      })
      const msg = type === 'outbound' ? '✅ 保存してLINEに通知しました' : '✅ 追跡番号を保存しました'
      showToast(msg)
      await load()
    } catch { showToast('❌ 保存に失敗しました') }
    setSavingTrack(null)
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

        <div className="space-y-4">
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

          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">追跡番号</h2>
            <div className="space-y-3">
              {[
                { key: 'inbound' as const, label: '受信追跡番号（ユーザー→弊社）', value: trackInbound, set: setTrackInbound, btnLabel: '保存' },
                { key: 'outbound' as const, label: '発送追跡番号（弊社→ユーザー）', value: trackOutbound, set: setTrackOutbound, btnLabel: '保存して通知' },
                { key: 'hq' as const, label: '本社追跡番号（弊社→本社）', value: trackHq, set: setTrackHq, btnLabel: '保存' },
              ].map((item) => (
                <div key={item.key}>
                  <label className="block text-xs text-gray-500 mb-1">{item.label}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={item.value}
                      onChange={(e) => item.set(e.target.value)}
                      placeholder="追跡番号を入力"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <button
                      onClick={() => saveTracking(item.key)}
                      disabled={savingTrack === item.key || !item.value.trim()}
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

          <section className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">返信エリア</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              {[
                { type: 'video_request', label: '動画依頼' },
                { type: 'return_request_exchange', label: '返送依頼（交換）' },
                { type: 'return_request_inspection', label: '返送依頼（検証）' },
                { type: 'shipping_complete', label: '発送完了' },
              ].map((t) => (
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
