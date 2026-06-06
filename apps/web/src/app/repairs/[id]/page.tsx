import RepairDetailClient from './repair-detail-client'

export function generateStaticParams() {
  return []
}

export default function RepairDetailPage({ params }: { params: { id: string } }) {
  return <RepairDetailClient id={params.id} />
}
