'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ScrapeReportRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/scraper'); }, []);
  return null;
}
