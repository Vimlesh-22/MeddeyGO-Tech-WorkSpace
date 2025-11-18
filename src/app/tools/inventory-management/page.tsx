import { redirect } from 'next/navigation';
import { getSessionUserFromCookies } from '@/lib/auth/session';
import { ToolFrame } from '@/components/ToolFrame';
import { TourWrapper } from '@/components/welcome/TourWrapper';

export default async function InventoryManagementPage() {
  // Server-side authentication check
  const user = await getSessionUserFromCookies();
  
  if (!user) {
    // Redirect to login with return URL
    redirect('/login?redirect=/tools/inventory-management');
  }
  
  return (
    <div className="flex flex-col h-screen">
      <TourWrapper userId={user.id} userEmail={user.email} toolId="inventory-management" />
      <ToolFrame toolSlug="inventory-management" toolName="Inventory Management" />
    </div>
  );
}

