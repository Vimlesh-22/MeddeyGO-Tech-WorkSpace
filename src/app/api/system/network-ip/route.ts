import os from 'os';
import { NextResponse } from 'next/server';

function resolveNetworkIP(): string | null {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    const ifaceList = interfaces[name];
    if (!ifaceList) continue;

    for (const iface of ifaceList) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address) {
        return iface.address;
      }
    }
  }

  return null;
}

export async function GET() {
  const ip = resolveNetworkIP();
  return NextResponse.json({ ip });
}
