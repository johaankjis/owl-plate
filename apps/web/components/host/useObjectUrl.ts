"use client";

import { useEffect, useState } from "react";

/**
 * A local preview URL for a picked photo. The URL is revoked whenever the file
 * changes and when the component unmounts, so no blob outlives its preview.
 */
export function useObjectUrl(file: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}
