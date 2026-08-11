'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import { authApi } from '@/api';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Signing up, in three steps.
 *
 * It was one page asking for everything at once, and it was about to get an
 * address on top. Splitting it is not decoration: a form's cost is what you
 * see before you start, and three short screens read as less work than one
 * long one even when the fields are identical.
 *
 * The account is created once, on the last step. The steps are progressive
 * disclosure of a single form, not three saves — abandoning halfway leaves no
 * half-made account behind, and no half-signed-up person wondering whether
 * they have one.
 *
 * Its own component rather than another branch inside AuthForm: that file
 * serves sign-in too, and a wizard threaded through it would make both harder
 * to read than either is alone.
 */

const STEPS = ['You', 'What you do', 'Where you are'] as const;

export function SignUpWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signUp, isAuthenticated } = useAuth();

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Step 1
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [referralCode, setReferralCode] = useState('');

  // Step 2
  const [roles, setRoles] = useState<string[]>([]);

  // Step 3
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postal, setPostal] = useState('');
  const [country, setCountry] = useState('PH');
  const [studioName, setStudioName] = useState('');
  const [socialHandle, setSocialHandle] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  /**
   * The roles come from the server, not a copy in this file — the same list
   * the register endpoint validates against, so the form cannot offer
   * something that will be rejected.
   */
  const { data: roleList } = useQuery({
    queryKey: ['auth', 'roles'],
    queryFn: () => authApi.listRoles(),
    staleTime: Infinity,
  });

  const next = searchParams.get('next') || '/';
  useEffect(() => {
    if (isAuthenticated) router.replace(next);
  }, [isAuthenticated, next, router]);

  /*
   * What each step is still missing, named rather than implied.
   *
   * A greyed-out button with no explanation is the worst version of a
   * required field — you are told no and not told why. Every step can say
   * exactly what it is waiting for.
   */
  const missing: string[][] = [
    [
      !email.trim() && 'an email address',
      password.length < 8 && 'a password of at least 8 characters',
      confirm.length > 0 && confirm !== password && 'both passwords to match',
      password.length >= 8 && !confirm && 'the password confirmed',
    ].filter(Boolean as unknown as (v: unknown) => v is string),
    [roles.length === 0 && 'at least one role'].filter(
      Boolean as unknown as (v: unknown) => v is string,
    ),
    [
      !line1.trim() && 'a street address',
      !city.trim() && 'a city or municipality',
      !province.trim() && 'a province or region',
      country.trim().length !== 2 && 'a two-letter country code',
      !acceptedTerms && 'the Terms and Privacy Policy',
    ].filter(Boolean as unknown as (v: unknown) => v is string),
  ];

  const stepReady = missing[step].length === 0;
  const isLast = step === STEPS.length - 1;

  const submit = () => {
    setError(null);
    signUp.mutate(
      {
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
        roles,
        addressLine1: line1.trim(),
        addressLine2: line2.trim() || undefined,
        addressCity: city.trim(),
        addressProvince: province.trim(),
        addressPostal: postal.trim() || undefined,
        addressCountry: country.trim().toUpperCase(),
        studioName: studioName.trim() || undefined,
        socialHandle: socialHandle.trim() || undefined,
        referralCode: referralCode.trim() || undefined,
      },
      {
        // Not into the app: registering no longer signs anybody in. The
        // address goes along so the next screen can name it and offer to send
        // the link again.
        onSuccess: () =>
          router.replace(`/check-inbox?email=${encodeURIComponent(email.trim())}`),
        onError: (err: Error) => {
          setError(err.message);
          // A duplicate email or a rejected password belongs to step one, and
          // leaving somebody on the address step with an error about their
          // email is how a form becomes a maze.
          if (/email|password/i.test(err.message)) setStep(0);
        },
      },
    );
  };

  return (
    <div className="mx-auto w-full max-w-md px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A private workspace for your shoots and your clients.
        </p>
      </div>

      {/* Where you are and how much is left. Three labelled markers rather
          than a bare bar: "Step 2 of 3" says how far, the labels say what is
          still coming, and the second is what stops it feeling open-ended. */}
      <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <span
              className={cn(
                'h-1 rounded-full transition-colors',
                i < step ? 'bg-primary' : i === step ? 'bg-primary/60' : 'bg-muted',
              )}
            />
            <span
              className={cn(
                'text-[11px]',
                i === step ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      <form
        className="rounded-xl border bg-card p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!stepReady) return;
          if (isLast) submit();
          else setStep((s) => s + 1);
        }}
      >
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Name" hint="Optional — what people see on your profile.">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                maxLength={120}
              />
            </Field>

            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@studio.com"
                autoComplete="email"
                required
              />
            </Field>

            <Field label="Password">
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>

            <Field
              label="Confirm password"
              error={
                confirm.length > 0 && confirm !== password
                  ? 'These do not match.'
                  : undefined
              }
            >
              <Input
                type={showPassword ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Type it again"
                autoComplete="new-password"
                required
              />
            </Field>

            {/*
              On the first step rather than with the other optional fields two
              screens later: somebody who was sent a code is holding it now, and
              a field they have to go looking for is a referral that never pays.
            */}
            <Field label="Invite code (optional)">
              <Input
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="From whoever invited you"
                autoCapitalize="characters"
                maxLength={32}
                className="font-mono tracking-widest"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Leave it blank if you do not have one. Nothing here can stop your
                account being created.
              </p>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <Label>What do you do?</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Pick every one that applies. It is how the right jobs find you.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(roleList?.data ?? []).map((role) => {
                const on = roles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() =>
                      setRoles((current) =>
                        on ? current.filter((r) => r !== role) : [...current, role],
                      )
                    }
                  >
                    <Badge
                      variant={on ? 'default' : 'outline'}
                      className="cursor-pointer px-3 py-1.5 text-[13px]"
                    >
                      {role}
                    </Badge>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {roles.length === 0
                ? 'Choose at least one.'
                : `${roles.length} selected — you can change these later.`}
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Field label="Street address">
              <Input
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                placeholder="123 Rizal Street, Barangay San Roque"
                autoComplete="address-line1"
                maxLength={200}
                required
              />
            </Field>

            <Field label="Apartment, unit, floor" hint="Optional.">
              <Input
                value={line2}
                onChange={(e) => setLine2(e.target.value)}
                autoComplete="address-line2"
                maxLength={200}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City or municipality">
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Cebu City"
                  autoComplete="address-level2"
                  maxLength={120}
                  required
                />
              </Field>
              <Field label="Province or region">
                <Input
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  placeholder="Cebu"
                  autoComplete="address-level1"
                  maxLength={120}
                  required
                />
              </Field>
              {/* Optional on purpose. Plenty of Philippine addresses have no
                  ZIP, and refusing somebody for that is refusing them for
                  where they live. */}
              <Field label="Postal code" hint="Optional.">
                <Input
                  value={postal}
                  onChange={(e) => setPostal(e.target.value)}
                  autoComplete="postal-code"
                  maxLength={20}
                />
              </Field>
              <Field label="Country">
                <Input
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                  autoComplete="country"
                  maxLength={2}
                  required
                />
              </Field>
            </div>

            <Field label="Studio name" hint="Optional — if you trade under one.">
              <Input
                value={studioName}
                onChange={(e) => setStudioName(e.target.value)}
                placeholder="Northlight Studio"
                maxLength={120}
              />
            </Field>

            <Field label="Social" hint="Optional — an @handle, a page, or a link.">
              <Input
                value={socialHandle}
                onChange={(e) => setSocialHandle(e.target.value)}
                placeholder="@yourstudio"
                maxLength={200}
              />
            </Field>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3.5">
              <Checkbox
                checked={acceptedTerms}
                onCheckedChange={(v) => setAcceptedTerms(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm leading-relaxed text-muted-foreground">
                I have read and agree to the{' '}
                <Link href="/terms" className="font-medium text-primary hover:underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="font-medium text-primary hover:underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Your address is private. It is never shown on your profile or to
              anyone you work with.
            </p>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center gap-2">
          {step > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setError(null);
                setStep((s) => s - 1);
              }}
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
          )}
          <Button
            type="submit"
            className="ml-auto"
            disabled={!stepReady || signUp.isPending}
          >
            {signUp.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isLast ? (
              <Check className="size-4" />
            ) : null}
            {isLast ? 'Create account' : 'Continue'}
          </Button>
        </div>

        {!stepReady && (
          <p className="mt-3 text-xs text-muted-foreground">
            Still needed: {missing[step].join(', ')}.
          </p>
        )}
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
