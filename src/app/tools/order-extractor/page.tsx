'use client';

import { ToolFrame } from '@/components/ToolFrame';
import { TourWrapper } from '@/components/welcome/TourWrapper';

export default function OrderExtractorPage() {
  return (
    <div className="flex flex-col h-screen">
      <TourWrapper toolId="order-extractor" />
      <ToolFrame toolSlug="order-extractor" toolName="Order ID Extractor" />
    </div>
  );
}

