'use client';

import { useEffect, useRef } from 'react';

interface StyledQrCodeProps {
  value: string;
  color: string;
  dotColor: string;
  logoUrl?: string;
  size?: number;
}

// qr-code-styling touches `window` at load, so it must be dynamically
// imported inside the effect (never at module top level) to stay SSR-safe.
export default function StyledQrCode({
  value,
  color,
  dotColor,
  logoUrl,
  size = 180,
}: StyledQrCodeProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { default: QRCodeStyling } = await import('qr-code-styling');
      if (cancelled) return;
      const qr = new QRCodeStyling({
        width: size,
        height: size,
        data: value,
        margin: 8,
        qrOptions: { errorCorrectionLevel: 'H' },
        dotsOptions: { color: dotColor, type: 'rounded' },
        cornersSquareOptions: { color, type: 'extra-rounded' },
        cornersDotOptions: { color },
        backgroundOptions: { color: '#ffffff' },
        image: logoUrl,
        imageOptions: { imageSize: 0.22, margin: 4, crossOrigin: 'anonymous' },
      });
      if (ref.current) {
        ref.current.innerHTML = '';
        qr.append(ref.current);
      }
    })();
    return () => {
      cancelled = true;
      if (ref.current) ref.current.innerHTML = '';
    };
  }, [value, color, dotColor, logoUrl, size]);

  return <div ref={ref} className="rounded-lg bg-white p-2" />;
}
