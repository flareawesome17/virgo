'use client';

import { useEffect, useMemo, useState } from 'react';
import { encode } from 'uqr';
import { Check, Copy, Download, ShieldCheck } from 'lucide-react';
import { useEnableTwoFactor, useStartTwoFactor } from '@/hooks/useConsole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * A QR code drawn as one SVG path from the module grid.
 *
 * Black on white whatever the theme: a phone camera reads dark-on-light
 * reliably, and an inverted code is a gamble. The quiet border is part of the
 * code, not decoration.
 */
export function QrCode({ value, size = 176 }: { value: string; size?: number }) {
  const { path, cells } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    qr.data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) d += `M${x},${y}h1v1h-1z`;
      }),
    );
    return { path: d, cells: qr.size };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${cells} ${cells}`}
      width={size}
      height={size}
      role="img"
      aria-label="QR code for your authenticator app"
      shapeRendering="crispEdges"
      className="rounded-md"
    >
      <rect width={cells} height={cells} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

/** Groups of four, the way authenticator apps show a key typed by hand. */
function spaced(secret: string) {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Enrolling an authenticator app: scan, type the code it shows, then keep the
 * recovery codes. The codes are shown once and only once — the server keeps
 * digests — so the last step will not let itself be skipped by accident.
 */
export function TwoFactorSetup({ onDone }: { onDone: () => void }) {
  const start = useStartTwoFactor();
  const enable = useEnableTwoFactor();
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);

  // A new secret every time this mounts. Calling setup again replaces the
  // pending one server-side, so a reload simply shows a fresh code.
  const { mutate: begin } = start;
  useEffect(() => {
    begin();
  }, [begin]);

  if (codes) return <RecoveryCodes codes={codes} onDone={onDone} />;

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    const result = await enable.mutateAsync(code.replace(/\s/g, '')).catch(() => null);
    if (result) setCodes(result.recoveryCodes);
  }

  return (
    <div className="space-y-5">
      <ol className="space-y-1.5 text-sm text-muted-foreground">
        <li>
          1. Open an authenticator app — Google Authenticator, 1Password, Microsoft
          Authenticator, Authy.
        </li>
        <li>2. Scan this code, or type the key under it.</li>
        <li>3. Enter the six-digit code the app shows.</li>
      </ol>

      <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-4">
        {start.data ? (
          <>
            <QrCode value={start.data.uri} />
            <code className="select-all break-all text-center font-mono text-xs tracking-wider text-muted-foreground">
              {spaced(start.data.secret)}
            </code>
          </>
        ) : start.isError ? (
          <div className="py-10 text-center text-sm">
            <p className="text-destructive">{start.error.message}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => begin()}>
              Try again
            </Button>
          </div>
        ) : (
          <Skeleton className="size-44" />
        )}
      </div>

      <form onSubmit={confirm} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="totp-code">Code from the app</Label>
          <Input
            id="totp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123 456"
            className="text-center font-mono text-lg tracking-[0.3em]"
          />
        </div>
        {enable.isError && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {enable.error.message}
          </p>
        )}
        <Button
          type="submit"
          className="w-full"
          disabled={!start.data || code.replace(/\s/g, '').length !== 6 || enable.isPending}
        >
          {enable.isPending ? 'Checking…' : 'Turn on two-factor'}
        </Button>
      </form>
    </div>
  );
}

/**
 * The recovery codes, once. Copy, download, and an explicit "saved them" —
 * nothing here is shown again.
 */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const text = codes.join('\n');

  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [`Virgo Console recovery codes\nEach works once. Keep them somewhere safe.\n\n${text}\n`],
        { type: 'text/plain' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'virgo-console-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
        <p>
          Two-factor is on. Keep these recovery codes somewhere safe — each signs you in once if
          you lose your phone. <strong>They will not be shown again.</strong>
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border bg-card p-4 font-mono text-sm">
        {codes.map((c) => (
          <li key={c} className="select-all tabular-nums">
            {c}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setSaved(true);
            });
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button variant="outline" className="flex-1" onClick={download}>
          <Download className="size-4" />
          Download
        </Button>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="size-4 accent-primary"
        />
        I have saved these codes
      </label>

      <Button className="w-full" disabled={!saved} onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
