import RepairDetailClient from './repair-detail-client'

export function generateStaticParams() {
  return []
}

export default async function RepairDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <RepairDetailClient id={id} />
}
