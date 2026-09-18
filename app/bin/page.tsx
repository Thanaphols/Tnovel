'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function BinRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/bin');
  }, [router]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
      <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
      <p className="text-xs text-slate-400">กำลังนำคุณไปยังระบบถังขยะใน Admin Console...</p>
    </div>
  );
}
