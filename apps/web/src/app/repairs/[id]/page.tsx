'use client';
import { useParams } from 'next/navigation';
import RepairDetailClient from './repair-detail-client';

export default function Page() {
  const params = useParams();
  const id = params.id as string;
  return <RepairDetailClient id={id} />;
}
