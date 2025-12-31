'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // This page just redirects - middleware handles the actual routing
    router.push('/landing');
  }, [router]);

  return null;
}
