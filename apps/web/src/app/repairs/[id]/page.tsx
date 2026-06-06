import RepairDetailClient from './repair-detail-client';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return [];
}

type Props = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <RepairDetailClient id={id} />;
}
