'use client';

import { useState } from 'react';
import { Button } from '@inspower/ui/components/button';

/** Ten codes shown once, with copy and download; the person ticks that they saved them. */
export function RecoveryCodes({
  codes,
  onDone,
  doneLabel = 'Done',
}: {
  codes: string[];
  onDone: () => void;
  doneLabel?: string;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Older browsers: the person can select the list by hand.
    }
  }
  function download() {
    const blob = new Blob([`Recovery codes (each works once)\n\n${text}\n`], {
      type: 'text/plain',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Keep these somewhere safe, such as a password manager. Each code signs you in once if you
        lose your phone. They will not be shown again.
      </p>
      <ol
        className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border bg-muted/40 p-4 font-mono text-sm"
        aria-label="Recovery codes"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          Download
        </Button>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-5 accent-primary"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        I have saved these codes
      </label>
      <Button type="button" className="w-full sm:w-auto" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}
