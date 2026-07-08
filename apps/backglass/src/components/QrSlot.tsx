interface QrSlotProps {
  url?: string
}

export default function QrSlot({ url }: QrSlotProps) {
  void url
  return (
    <div className="qr-slot">
      <div className="qr-pattern">
        {Array.from({ length: 25 }).map((_, i) => (
          <span
            key={i}
            className="qr-dot"
            data-on={(i * 7 + (i % 3) * 5) % 3 === 0 ? 'true' : 'false'}
          />
        ))}
      </div>
      <div className="qr-caption">
        BIENTÔT
        <br />
        SCANNEZ POUR REJOINDRE
      </div>
    </div>
  )
}
