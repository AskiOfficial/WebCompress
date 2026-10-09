import { useState, useEffect } from 'react';
import { BrowserCapabilities } from '../types';
import { detectBrowserCapabilities } from '../services/media/capabilityDetector';

export function useCapabilities() {
  const [capabilities, setCapabilities] = useState<BrowserCapabilities | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    detectBrowserCapabilities().then((caps) => {
      if (mounted) {
        setCapabilities(caps);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  return { capabilities, loading };
}
