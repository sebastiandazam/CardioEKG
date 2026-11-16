import { useEffect, useState } from 'react';

export function usePhotoUrl(image: Blob | null | undefined) {
  const [current, setCurrent] = useState<{ image: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!image) {
      setCurrent(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setCurrent({ image, url });
    return () => URL.revokeObjectURL(url);
  }, [image]);
  return current && current.image === image ? current.url : null;
}

