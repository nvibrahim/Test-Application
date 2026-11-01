'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
import { API_BASE_PATH, CSRF_HEADER, APP_SLUG } from '@inspower/shared';

const slots = [
  { key: 'logo_light', label: 'Logo for light backgrounds', help: 'PNG, JPG or WebP up to 1 MB.' },
  {
    key: 'logo_dark',
    label: 'Logo for dark backgrounds',
    help: 'Used in dark mode and on coloured panels.',
  },
  {
    key: 'favicon',
    label: 'Browser-tab icon',
    help: 'A square PNG; the browser fits any picture into a square first.',
  },
  {
    key: 'sign_in_image',
    label: 'Sign-in picture',
    help: 'Shown on the sign-in page when the panel is set to "Uploaded picture".',
  },
] as const;

function csrf(): string {
  for (const part of document.cookie.split(';')) {
    const [n, ...rest] = part.trim().split('=');
    if (n === `${APP_SLUG}_csrf` || n === `__Host-${APP_SLUG}_csrf`)
      return decodeURIComponent(rest.join('='));
  }
  return '';
}

/** A square PNG from any picture, drawn in the browser, for the tab icon. */
async function squarePng(file: File, size = 192): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const scale = Math.min(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
}

export function BrandAssets({ assets }: { assets: Record<string, string> }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function upload(slot: string, file: File) {
    setBusy(slot);
    setMessage(null);
    try {
      const body = slot === 'favicon' ? await squarePng(file) : file;
      const res = await fetch(`${API_BASE_PATH}/settings/brand/${slot}`, {
        method: 'PUT',
        body,
        credentials: 'same-origin',
        headers: { 'content-type': body.type || 'application/octet-stream', [CSRF_HEADER]: csrf() },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Upload failed');
      setMessage({ kind: 'ok', text: `Saved (${json.width}×${json.height}).` });
      router.refresh();
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Upload failed' });
    } finally {
      setBusy(null);
    }
  }
  async function remove(slot: string) {
    setBusy(slot);
    try {
      await fetch(`${API_BASE_PATH}/settings/brand/${slot}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { [CSRF_HEADER]: csrf() },
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {message ? (
        <Alert variant={message.kind === 'ok' ? 'success' : 'destructive'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}
      <ul className="divide-y rounded-lg border">
        {slots.map((s) => (
          <li key={s.key} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div className="flex items-center gap-3">
              {assets[s.key] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assets[s.key]} alt="" className="size-12 rounded border object-contain" />
              ) : (
                <div className="size-12 rounded border border-dashed" aria-hidden="true" />
              )}
              <div>
                <div className="font-medium">{s.label}</div>
                <div className="text-xs text-muted-foreground">{s.help}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                ref={(el) => {
                  inputs.current[s.key] = el;
                }}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                aria-label={`Choose ${s.label}`}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(s.key, f);
                  e.target.value = '';
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => inputs.current[s.key]?.click()}
              >
                {assets[s.key] ? 'Replace' : 'Upload'}
              </Button>
              {assets[s.key] ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => remove(s.key)}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
