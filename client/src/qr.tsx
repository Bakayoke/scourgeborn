import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

/** Local QR (no third-party API). */
export function JoinQr({ url, size = 280, alt }: { url: string; size?: number; alt: string }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void QRCode.toDataURL(url, {
      width: size,
      margin: 1,
      color: { dark: '#0c1410', light: '#f4f7f2' },
    }).then((data) => {
      if (!cancelled) setSrc(data)
    })
    return () => {
      cancelled = true
    }
  }, [url, size])

  if (!src) {
    return <div className="qr-placeholder" style={{ width: size, height: size }} aria-hidden />
  }
  return <img src={src} width={size} height={size} alt={alt} />
}
