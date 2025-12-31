'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';

export default function ClearCookiesPage() {
  const router = useRouter();
  const [status, setStatus] = useState('Clearing cookies...');

  useEffect(() => {
    const clearAll = async () => {
      try {
        const supabase = createClient();
        
        // Sign out to clear Supabase cookies
        await supabase.auth.signOut();
        
        // Get all cookies and clear them
        const cookies = document.cookie.split(";");
        
        for (const cookie of cookies) {
          const eqPos = cookie.indexOf("=");
          const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
          
          // Clear cookie for current path
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;`;
          // Clear cookie for root path
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname};`;
          // Clear cookie without domain
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=;`;
        }
        
        // Clear localStorage
        try {
          localStorage.clear();
        } catch (e) {
          console.log('Error clearing localStorage:', e);
        }
        
        // Clear sessionStorage
        try {
          sessionStorage.clear();
        } catch (e) {
          console.log('Error clearing sessionStorage:', e);
        }
        
        setStatus('Cookies cleared! Redirecting...');
        
        // Force reload to clear everything
        setTimeout(() => {
          window.location.href = '/landing';
        }, 1000);
      } catch (error) {
        console.error('Error clearing cookies:', error);
        setStatus('Error clearing cookies. Please clear manually from browser settings.');
        setTimeout(() => {
          window.location.href = '/landing';
        }, 3000);
      }
    };

    clearAll();
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
        <p className="text-lg text-slate-700 dark:text-slate-300">{status}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          If this doesn&apos;t work, please clear cookies manually from browser settings
        </p>
      </div>
    </div>
  );
}
