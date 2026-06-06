'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import RepairDetailClient from './repair-detail-client';

function DetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  return <RepairDetailClient id={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <DetailContent />
    </Suspense>
  );
}
