import { headers } from "next/headers";
import QRCode from "qrcode";

export default async function MasterQrPage() {
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const registrationUrl = `${protocol}://${host}/portal/register`;

  const qrDataUrl = await QRCode.toDataURL(registrationUrl, {
    width: 320,
    margin: 2,
    color: { dark: "#0a0705", light: "#f2ece1" },
  });

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold mb-1">Master QR</h1>
      <p className="text-sm text-muted mb-6">
        Static, non-expiring registration QR. Print and display at reception.
      </p>

      <div className="max-w-sm border border-border bg-surface rounded-lg p-8 flex flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt="NXS Portal registration QR code" width={320} height={320} />
        <p className="text-xs text-muted break-all text-center">{registrationUrl}</p>
      </div>
    </div>
  );
}
