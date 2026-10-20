import { useMemo } from 'preact/hooks';
import { encodeQr, qrSvgPath, type QrEcl } from '../lib/qr';

interface Props {
  value: string;
  /** Rendered pixel size (square). */
  size?: number;
  ecl?: QrEcl;
  class?: string;
  label: string;
}

/** Inline-SVG QR code generated on the device (no network, works offline). */
export function QrCode({ value, size = 168, ecl = 'M', class: cls, label }: Props) {
  const { path, dim } = useMemo(() => {
    const qr = encodeQr(value, ecl);
    return { path: qrSvgPath(qr, 4), dim: qr.size + 8 };
  }, [value, ecl]);
  return (
    <svg
      class={cls}
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${dim} ${dim}`}
      shape-rendering="crispEdges"
    >
      <title>{label}</title>
      <rect width={dim} height={dim} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
