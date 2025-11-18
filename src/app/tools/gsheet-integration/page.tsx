'use client';

import { ToolFrame } from '@/components/ToolFrame';
import { TourWrapper } from '@/components/welcome/TourWrapper';

export default function GSheetIntegrationPage() {
  return (
    <div className="flex flex-col h-screen">
      <TourWrapper toolId="gsheet-integration" />
      <ToolFrame toolSlug="gsheet-integration" toolName="Google Sheets Integration" />
    </div>
  );
}

