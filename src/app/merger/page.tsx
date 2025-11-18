import ComingSoon from '@/components/ComingSoon';
import { Combine } from 'lucide-react';

export default function MergerPage() {
  return (
    <ComingSoon
      toolName="File Merger"
      description="Seamlessly merge and consolidate multiple files while maintaining data integrity and structure."
      features={[
        'Merge CSV, Excel, and JSON files intelligently',
        'Automatic duplicate detection and removal',
        'Custom merge rules and mappings',
        'Handle large files with ease',
        'Preview before merging',
        'Maintain data relationships and integrity'
      ]}
      estimatedDate="Q2 2026"
      icon={<Combine className="w-10 h-10 text-white" />}
    />
  );
}
