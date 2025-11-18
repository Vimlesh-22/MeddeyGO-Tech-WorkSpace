'use client';

import { ToolFrame } from '@/components/ToolFrame';
import { TourWrapper } from '@/components/welcome/TourWrapper';

export default function QuoteGeneratorPage() {
  return (
    <div className="flex flex-col h-screen">
      <TourWrapper toolId="quote-generator" />
      <ToolFrame toolSlug="quote-generator" toolName="Quote Generator" />
    </div>
  );
}

