'use client';

import { ToolFrame } from '@/components/ToolFrame';
import { TourWrapper } from '@/components/welcome/TourWrapper';

export default function DataExtractorProPage() {
  return (
    <div className="flex flex-col h-screen">
      <TourWrapper toolId="data-extractor-pro" />
      <ToolFrame toolSlug="data-extractor-pro" toolName="Data Extractor Pro" />
    </div>
  );
}

