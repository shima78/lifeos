import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Downloads an Excel (.xlsx) export. The API sends it as an attachment, so the page stays put. */
export function ExportButton({
  href,
  label = 'Export to Excel',
}: {
  href: string;
  label?: string;
}) {
  return (
    <Button asChild variant="outline">
      <a href={href} download title="Download as an Excel file (.xlsx)">
        <FileSpreadsheet /> {label}
      </a>
    </Button>
  );
}
