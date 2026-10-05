'use client';

import { useParams } from 'next/navigation';
import { ApplicationForm } from '@/components/application-form';
import { ErrorState, LoadingRows, PageHeader } from '@/components/states';
import { useApplication } from '@/lib/queries';

export default function EditApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isPending, refetch } = useApplication(id);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Edit application"
        description={data ? `${data.title} · ${data.company.name}` : ' '}
      />
      {isPending ? (
        <LoadingRows rows={8} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <ApplicationForm key={data.updatedAt} application={data} />
      )}
    </div>
  );
}
