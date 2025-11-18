'use client';

import { ToolFrame } from '@/components/ToolFrame';
import { TourWrapper } from '@/components/welcome/TourWrapper';

export default function FileMergerPage() {
  return (
    <div className="flex flex-col h-screen">
      <TourWrapper toolId="file-merger" />
      <ToolFrame toolSlug="file-merger" toolName="File Merger" />
    </div>
  );
}

