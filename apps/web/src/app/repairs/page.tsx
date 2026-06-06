'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

const FORM_ID = '49a84e34-831c-462c-b801-a30c44d46f57'

const OUR_STATUSES = ['全件', '受付済み', '動画依頼済み', '動画受領済み', '返送依頼済み', '返送受領済み', '発送済み', '完了']

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
  '未申請':     'bg-gray-100 text-gray-600',
  '申請済み':   'bg-blue-100 text-blue-700',
  '審査中':     'bg-yellow-100 text-yellow-700',
  '承認済み':   'bg-green-100 text-green-700',
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

function StatusBadge({ status, colorMap }: { status: string; colorMap: Record<string, string> }) {
  const cls = colorMap[status] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

export default function RepairsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('全件')

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

  const counts = useMemo(() => {
    const map: Record<string, number> = { '全件': submissions.length }
    for (const s of submissions) {
      const st = s.our_status ?? '受付済み'
      map[st] = (map[st] ?? 0) + 1
    }
    return map
  }, [submissions])

  const filtered = useMemo(() => {
    if (activeTab === '全件') return submissions
    return submissions.filter((s) => (s.our_status ?? '受付済み') === activeTab)
  }, [submissions, activeTab])

  return (
    <div>
      <Header title="故障申請管理" description="Shaken故障申請の受付・対応状況を管理" />

      {/* タブ */}
      <div className="overflow-x-auto mb-5">
        <div className="flex gap-1 min-w-max">
          {OUR_STATUSES.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'bg-[#06C755] text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab}
              {counts[tab] != null && (
                <span
                  className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold ${
                    activeTab === tab ? 'bg-white/30 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {counts[tab]}
                </span>
              )}
            </button>
          ))}
        </div>
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
                  {/* 左：申請情報 */}
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

                  {/* 右：日時・ボタン */}
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
