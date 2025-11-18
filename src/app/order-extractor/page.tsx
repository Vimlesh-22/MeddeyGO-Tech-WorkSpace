import ComingSoon from '@/components/ComingSoon';
import { Receipt } from 'lucide-react';

export default function OrderExtractorPage() {
  return (
    <ComingSoon
      toolName="Order ID Extractor"
      description="Automated order ID extraction and tracking system for streamlined order management."
      features={[
        'Extract order IDs from emails and documents',
        'Automatic AWB number detection',
        'Batch processing for multiple orders',
        'Integration with shipping providers',
        'Order status tracking',
        'Generate shipping labels automatically'
      ]}
      estimatedDate="Q1 2026"
      icon={<Receipt className="w-10 h-10 text-white" />}
    />
  );
}
