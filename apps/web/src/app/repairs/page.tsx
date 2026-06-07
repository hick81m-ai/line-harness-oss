'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

const FORM_ID = '49a84e34-831c-462c-b801-a30c44d46f57'

const OUR_STATUS_OPTIONS = ['受付済み', '動画依頼済み', '動画受領済み', '返送依頼済み', '返送伝票受領済み', '発送済み', '追跡番号連絡済み', '完了', 'キャンセル', '不良症状なし']
const HQ_STATUS_OPTIONS = ['未申請', '申請済み', '審査中', '承認済み', '本社に返送済み', 'キャンセル', '不良症状なし', '有償修理']
const CUSTOMER_OPTIONS = ['ヴァリエ', '4works', 'OZALLY', '岡', 'AOT', 'Fライン', '対象外']

const OUR_STATUS_COLORS: Record<string, string> = {
  '受付済み':          'bg-gray-100 text-gray-700',
  '動画依頼済み':      'bg-blue-100 text-blue-700',
  '動画受領済み':      'bg-cyan-100 text-cyan-700',
  '返送依頼済み':      'bg-orange-100 text-orange-700',
  '返送伝票受領済み':  'bg-purple-100 text-purple-700',
  '発送済み':          'bg-green-100 text-green-700',
  '追跡番号連絡済み':  'bg-teal-100 text-teal-700',
  '完了':              'bg-emerald-100 text-emerald-800',
  'キャンセル':        'bg-red-100 text-red-700',
  '不良症状なし':      'bg-gray-100 text-gray-500',
}

const HQ_STATUS_COLORS: Record<string, string> = {
  '未申請':        'bg-gray-100 text-gray-600',
  '申請済み':      'bg-blue-100 text-blue-700',
  '審査中':        'bg-yellow-100 text-yellow-700',
  '承認済み':      'bg-green-100 text-green-700',
  '本社に返送済み': 'bg-purple-100 text-purple-700',
  'キャンセル':    'bg-gray-100 text-gray-500',
  '不良症状なし':  'bg-gray-100 text-gray-500',
  '有償修理':      'bg-amber-100 text-amber-700',
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
  arrived_at?: string | null
  sent_serial_number?: string | null
  hq_tracking_number?: string | null
  inventory_type?: string | null
  customer?: string | null
}

const QUICK_FILTERS: { label: string; fn: (s: Submission) => boolean }[] = [
  { label: '全件', fn: () => true },
  { label: '未対応', fn: (s) => (s.our_status ?? '受付済み') === '受付済み' },
  { label: 'ユーザー待ち', fn: (s) => ['動画依頼済み', '返送依頼済み'].includes(s.our_status ?? '') },
  { label: '弊社待ち', fn: (s) => ['動画受領済み', '返送伝票受領済み'].includes(s.our_status ?? '') && s.return_type === 'inspection' },
  { label: '出荷予定', fn: (s) => (s.our_status ?? '') === '返送伝票受領済み' && s.return_type === 'exchange' },
  { label: '着荷未確認', fn: (s) => !s.arrived_at },
  { label: '本社未申請', fn: (s) => (s.hq_status ?? '未申請') === '未申請' && !['キャンセル', '不良症状なし', '完了'].includes(s.our_status ?? '') },
]

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

function StatusBadge({ status, colorMap }: { status: string; colorMap: Record<string, string> }) {
  const cls = colorMap[status] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

function escapeCsv(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function downloadCsv(submissions: Submission[]) {
  const headers = [
    '受付番号', '申請日時', 'LINE名', '会員名', '会員ID', 'シリアル番号', '故障症状',
    '弊社ステータス', '本社ステータス', '返送種別', 'カスタマー',
    '着払い料金', '送料(弊社→ユーザー)', '送料(弊社→本社)', 'お届け予定日', '着荷確認日時',
    '送付シリアル番号', '本社発行追跡番号', '在庫区分',
    '郵便番号', '住所', '宛名', '電話番号', '備考',
  ]
  const rows = submissions.map((sub) => {
    const d = sub.data
    return [
      buildReceiptNumber(sub),
      formatDateTime(sub.createdAt),
      sub.friendName,
      d.member_name,
      d.member_id,
      d.serial_number,
      d.failure_description,
      sub.our_status ?? '受付済み',
      sub.hq_status ?? '未申請',
      sub.return_type === 'exchange' ? '交換確定' : sub.return_type === 'inspection' ? '弊社検証' : '',
      sub.customer,
      sub.shipping_cost_inbound,
      sub.shipping_cost_outbound,
      sub.shipping_cost_hq,
      sub.estimated_delivery_date,
      sub.arrived_at ? formatDateTime(sub.arrived_at) : '',
      sub.sent_serial_number,
      sub.hq_tracking_number,
      sub.inventory_type,
      d.postal_code,
      d.address,
      d.recipient_name,
      d.phone,
      d.remarks,
    ].map(escapeCsv).join(',')
  })
  const bom = '﻿'
  const csv = bom + [headers.join(','), ...rows].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `repairs_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function RepairsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('全件')

  // 詳細フィルタ
  const [showDetailFilter, setShowDetailFilter] = useState(false)
  const [filterOurStatus, setFilterOurStatus] = useState<string[]>([])
  const [filterHqStatus, setFilterHqStatus] = useState<string[]>([])
  const [filterCustomer, setFilterCustomer] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchApi<{ success: boolean; data: Submission[] }>(
        `/api/forms/${FORM_ID}/submissions`,
      )
      if (res.success) {
        const items = res.data.map((s) => ({
          ...s,
          data: typeof s.data === 'string' ? JSON.parse(s.data as string) : s.data,
        }))
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setSubmissions(items)
      }
    } catch { /* silent */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const quickCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const qf of QUICK_FILTERS) {
      map[qf.label] = submissions.filter(qf.fn).length
    }
    return map
  }, [submissions])

  const filtered = useMemo(() => {
    const qf = QUICK_FILTERS.find((f) => f.label === activeFilter) ?? QUICK_FILTERS[0]
    let result = submissions.filter(qf.fn)
    if (filterOurStatus.length > 0) {
      result = result.filter((s) => filterOurStatus.includes(s.our_status ?? '受付済み'))
    }
    if (filterHqStatus.length > 0) {
      result = result.filter((s) => filterHqStatus.includes(s.hq_status ?? '未申請'))
    }
    if (filterCustomer.length > 0) {
      result = result.filter((s) => filterCustomer.includes(s.customer ?? ''))
    }
    return result
  }, [submissions, activeFilter, filterOurStatus, filterHqStatus, filterCustomer])

  function toggleCheck(arr: string[], setArr: (v: string[]) => void, val: string) {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val])
  }

  const hasDetailFilter = filterOurStatus.length > 0 || filterHqStatus.length > 0 || filterCustomer.length > 0

  return (
    <div>
      <Header
        title="故障申請管理"
        description="Shaken故障申請の受付・対応状況を管理"
        action={
          <button
            onClick={() => downloadCsv(submissions)}
            disabled={submissions.length === 0}
            className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            CSVエクスポート
          </button>
        }
      />

      {/* クイックフィルタ */}
      <div className="overflow-x-auto mb-3">
        <div className="flex gap-1 min-w-max">
          {QUICK_FILTERS.map((qf) => (
            <button
              key={qf.label}
              onClick={() => setActiveFilter(qf.label)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeFilter === qf.label
                  ? 'bg-[#06C755] text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {qf.label}
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold ${
                  activeFilter === qf.label ? 'bg-white/30 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {quickCounts[qf.label] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 詳細フィルタ */}
      <div className="mb-4">
        <button
          onClick={() => setShowDetailFilter(!showDetailFilter)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            hasDetailFilter
              ? 'border-green-400 bg-green-50 text-green-700'
              : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
          }`}
        >
          {showDetailFilter ? '▲' : '▼'} 詳細フィルタ{hasDetailFilter ? '（適用中）' : ''}
        </button>
        {showDetailFilter && (
          <div className="mt-2 bg-white border border-gray-200 rounded-lg p-4 space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">弊社ステータス</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {OUR_STATUS_OPTIONS.map((s) => (
                  <label key={s} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterOurStatus.includes(s)}
                      onChange={() => toggleCheck(filterOurStatus, setFilterOurStatus, s)}
                      className="accent-green-600"
                    />
                    <span className="text-xs text-gray-700">{s}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">本社ステータス</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {HQ_STATUS_OPTIONS.map((s) => (
                  <label key={s} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterHqStatus.includes(s)}
                      onChange={() => toggleCheck(filterHqStatus, setFilterHqStatus, s)}
                      className="accent-green-600"
                    />
                    <span className="text-xs text-gray-700">{s}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">カスタマー</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {CUSTOMER_OPTIONS.map((s) => (
                  <label key={s} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterCustomer.includes(s)}
                      onChange={() => toggleCheck(filterCustomer, setFilterCustomer, s)}
                      className="accent-green-600"
                    />
                    <span className="text-xs text-gray-700">{s}</span>
                  </label>
                ))}
              </div>
            </div>
            {hasDetailFilter && (
              <button
                onClick={() => { setFilterOurStatus([]); setFilterHqStatus([]); setFilterCustomer([]) }}
                className="text-xs text-red-500 hover:underline"
              >
                フィルタをクリア
              </button>
            )}
          </div>
        )}
      </div>

      {/* 一覧 */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-10 text-center text-gray-400 text-sm">
          申請がありません
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((sub) => {
            const d = sub.data
            const ourStatus = sub.our_status ?? '受付済み'
            const hqStatus = sub.hq_status ?? '未申請'
            return (
              <div
                key={sub.id}
                className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="text-xs font-mono text-gray-500">{buildReceiptNumber(sub)}</span>
                      <StatusBadge status={ourStatus} colorMap={OUR_STATUS_COLORS} />
                      <StatusBadge status={hqStatus} colorMap={HQ_STATUS_COLORS} />
                      {sub.return_type === 'exchange' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
                          交換確定
                        </span>
                      )}
                      {sub.return_type === 'inspection' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          弊社検証
                        </span>
                      )}
                      {sub.customer && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          {sub.customer}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm mb-1">
                      <span className="text-gray-900 font-medium">{sub.friendName || '—'}</span>
                      {!!d.member_name && (
                        <span className="text-gray-600">{String(d.member_name)}</span>
                      )}
                      {!!d.member_id && (
                        <span className="text-gray-400 text-xs">ID: {String(d.member_id)}</span>
                      )}
                    </div>

                    {!!d.failure_description && (
                      <p className="text-xs text-gray-500 truncate max-w-lg">
                        {String(d.failure_description)}
                      </p>
                    )}
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                    <span className="text-xs text-gray-400">{formatDateTime(sub.createdAt)}</span>
                    <Link
                      href={`/repairs/detail?id=${sub.id}`}
                      className="inline-flex items-center px-3 py-1.5 rounded-lg bg-[#06C755] text-white text-xs font-medium hover:bg-[#05b34b] transition-colors whitespace-nowrap"
                    >
                      対応する →
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
