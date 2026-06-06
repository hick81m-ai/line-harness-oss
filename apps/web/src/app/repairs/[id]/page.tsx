'use client';
import RepairDetailClient from './repair-detail-client';
import { useParams } from 'next/navigation';

export default function Page() {
  const params = useParams();
  const id = params.id as string;
  return <RepairDetailClient id={id} />;
}
