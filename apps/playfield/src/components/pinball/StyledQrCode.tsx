'use client';

import { useEffect, useRef } from 'react';

interface StyledQrCodeProps {
  value: string; // claimUrl
  color: string; // accent (yeux/coins) — var glow résolue
  dotColor: string; // dots sombres (var vignette résolue)
  logoUrl?: string;
  size?: number; // défaut 180
}

// QR stylé client via qr-code-styling. SSR-safe : la lib touche `window` au
// load → import dynamique dans le useEffect uniquement.
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
