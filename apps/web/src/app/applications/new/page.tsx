import type { Metadata } from 'next';
import { ApplicationForm } from '@/components/application-form';
import { PageHeader } from '@/components/states';

export const metadata: Metadata = { title: 'Add application' };

export default function NewApplicationPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add application"
        description="Track a job you're interested in or have applied to."
      />
      <ApplicationForm />
    </div>
  );
}
