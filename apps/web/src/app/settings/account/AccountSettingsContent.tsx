'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { Card, Input, Label, Badge, Button, Switch, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, toast } from '@intelliflow/ui';
import { useTheme } from 'next-themes';
import { TimezoneSelector } from '@/components/settings/TimezoneSelector';
import { AppAvatar } from '@/components/shared/app-avatar';
import { PageHeader } from '@/components/shared/page-header';
import { AccountSettingsLoading } from './AccountSettingsLoading';
import { ProfilePhotoDialog } from './ProfilePhotoDialog';

function getRoleMessage(role: string): string {
  if (role === 'ADMIN') return 'You can manage team roles and permissions in Team Settings.';
  if (role === 'MANAGER') return 'To change roles or permissions, contact your Admin.';
  return 'To change your username or role, contact the System Administrator.';
}

function getThemeIcon(t: string): string {
  if (t === 'light') return 'light_mode';
  if (t === 'dark') return 'dark_mode';
  return 'contrast';
}

export default function AccountSettingsContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  // ─── Queries ────────────────────────────────────────────────────────────
  const profileQuery = trpc.user.getProfile.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });

  // ─── Mutations ──────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const updateTimezoneMutation = trpc.user.updateTimezone.useMutation({
    onSuccess: () => utils.user.getProfile.invalidate(),
  });
  const updateProfileMutation = trpc.user.updateProfile.useMutation({
    onSuccess: () => utils.user.getProfile.invalidate(),
  });

  // ─── Local State ────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');
  const [timezone, setTimezone] = useState('Europe/London');
  const [language, setLanguage] = useState('en-US');
  const [dateFormat, setDateFormat] = useState('MM/DD/YYYY');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [desktopNotifications, setDesktopNotifications] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);

  const { theme, setTheme } = useTheme();

  // Sync server data to local state
  useEffect(() => {
    if (profileQuery.data) {
      const data = profileQuery.data;
      if (data.givenName || data.familyName) {
        setFirstName(data.givenName ?? '');
        setLastName(data.familyName ?? '');
      } else {
        const parts = String(data.name ?? '').split(' ');
        setFirstName(parts[0] ?? '');
        setLastName(parts.slice(1).join(' '));
      }
      setEmail(data.email);
      setRole(String(data.role ?? ''));
      setPhone(data.phone ?? '');
      setCompany(data.company ?? '');
      setDepartment(data.department ?? '');
      setLocation(data.location ?? '');
      setWebsite(data.website ?? '');
      setTimezone(data.timezone ?? 'Europe/London');
      setLanguage(data.locale ?? 'en-US');
    }
  }, [profileQuery.data]);

  // ─── Derived values ─────────────────────────────────────────────────────
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'User';
  const avatarSrc = profileQuery.data?.avatarUrl ?? null;
  const provider = profileQuery.data?.provider ?? null;
  const emailVerified = profileQuery.data?.emailVerified ?? false;
  const memberSince = profileQuery.data?.createdAt ?? null;
  const isLoading = authLoading || profileQuery.isLoading;
  const isSaving = updateTimezoneMutation.isPending || updateProfileMutation.isPending;
  const error = profileQuery.error;
  const username = email.split('@')[0] ?? '';

  // ─── Handlers ───────────────────────────────────────────────────────────
  const markDirty = useCallback(() => setIsDirty(true), []);

  const handleSave = useCallback(async () => {
    try {
      await Promise.all([
        updateProfileMutation.mutateAsync({
          givenName: firstName || null,
          familyName: lastName || null,
          phone: phone || null,
          company: company || null,
          department: department || null,
          location: location || null,
          website: website || null,
          locale: language || null,
        }),
        updateTimezoneMutation.mutateAsync({ timezone }),
      ]);
      setIsDirty(false);
      toast({
        title: 'Settings saved',
        description: 'Your profile settings have been updated.',
      });
    } catch (err) {
      toast({
        title: 'Error saving settings',
        description: err instanceof Error ? err.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  }, [
    firstName, lastName, phone, company, department, location, website,
    language, timezone, updateProfileMutation, updateTimezoneMutation,
  ]);

  const handleCancel = useCallback(() => {
    if (profileQuery.data) {
      const data = profileQuery.data;
      if (data.givenName || data.familyName) {
        setFirstName(data.givenName ?? '');
        setLastName(data.familyName ?? '');
      } else {
        const parts = String(data.name ?? '').split(' ');
        setFirstName(parts[0] ?? '');
        setLastName(parts.slice(1).join(' '));
      }
      setEmail(data.email);
      setPhone(data.phone ?? '');
      setCompany(data.company ?? '');
      setDepartment(data.department ?? '');
      setLocation(data.location ?? '');
      setWebsite(data.website ?? '');
      setTimezone(data.timezone ?? 'Europe/London');
      setLanguage(data.locale ?? 'en-US');
      setIsDirty(false);
    }
  }, [profileQuery.data]);

  // ─── Early Returns (after all hooks) ──────────────────────────────────
  if (isLoading) return <AccountSettingsLoading />;

  if (error) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-2xl">error</span>
        </div>
        <p className="text-lg font-semibold text-foreground mb-2">Failed to load profile</p>
        <p className="text-muted-foreground mb-6">{error.message}</p>
        <Button onClick={() => profileQuery.refetch()}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Settings', href: '/settings' },
          { label: 'Profile Settings' },
        ]}
        title="Profile Settings"
        description="Manage your personal information and account preferences."
        className="mb-6"
      />

      {/* ═══════════════════════════════════════════════════════════════════
          BENTO GRID — 12 columns
          Row 1: Profile Card with info rows (8) + Account Summary (4)
          Row 2: Basic Information form (8)      + Appearance (4)
          Row 3: Regional Preferences (6)        + Notifications (6)
          Row 4: Security (12)
          Row 5: Footer (12)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* ─── Row 1, Left: Profile Card ─────────────────────────────── */}
        <Card className="lg:col-span-8 overflow-hidden">
          <div className="h-28 bg-gradient-to-r from-blue-500/20 via-primary/15 to-blue-400/10 dark:from-blue-900/40 dark:via-primary/20 dark:to-slate-800" />

          <div className="px-6 pb-6 relative">
            {/* Avatar + name + upload */}
            <div className="relative -mt-12 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
              <div className="flex items-end gap-5">
                <div className="relative shrink-0">
                  <AppAvatar
                    name={fullName}
                    src={avatarSrc}
                    className="w-24 h-24 border-4 border-white dark:border-slate-900 shadow-md text-2xl"
                    fallbackClassName="text-2xl font-bold text-slate-500 bg-slate-200 dark:bg-slate-700"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute bottom-0 right-0 h-8 w-8 rounded-full shadow-sm"
                    aria-label="Upload profile photo"
                    onClick={() => setPhotoDialogOpen(true)}
                  >
                    <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                  </Button>
                </div>
                <div className="pb-1">
                  <h2 className="text-xl font-bold text-foreground">{fullName}</h2>
                  <p className="text-muted-foreground text-sm">{role}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="self-start sm:self-end shrink-0" onClick={() => setPhotoDialogOpen(true)}>
                <span className="material-symbols-outlined text-[16px] mr-1.5" aria-hidden="true">upload</span>Upload New Photo
              </Button>
            </div>

            {/* Contact info rows — same pattern as Contact detail page */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              {([
                { icon: 'mail', label: 'Email', value: email },
                { icon: 'call', label: 'Phone', value: phone || null },
                { icon: 'apartment', label: 'Company', value: company || null },
                { icon: 'work', label: 'Department', value: department || null },
                { icon: 'location_on', label: 'Location', value: location || null },
                { icon: 'language', label: 'Website', value: website || null },
              ] as const).map((field) => (
                <div key={field.label} className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[20px] mt-0.5">{field.icon}</span>
                  <div className="min-w-0">
                    <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider">{field.label}</span>
                    {field.value ? (
                      <p className="text-sm text-foreground truncate">{field.value}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Add your {field.label.toLowerCase()}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* ─── Row 1, Right: Account Summary ─────────────────────────── */}
        <Card className="lg:col-span-4 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-[18px]">shield_person</span>
              </div>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Account</h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Role</span>
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 dark:bg-primary/20">
                  <span className="material-symbols-outlined text-[12px] mr-1" aria-hidden="true">shield_person</span>
                  {role}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Username</span>
                <span className="text-sm font-medium text-foreground">{username}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Timezone</span>
                <span className="text-sm font-medium text-foreground truncate ml-2 max-w-[140px]" title={timezone}>
                  {timezone.split('/').pop()?.replaceAll('_', ' ')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                  Active
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plan</span>
                <Link href="/billing">
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 dark:bg-primary/20 hover:bg-primary/20 dark:hover:bg-primary/30 cursor-pointer transition-colors">
                    <span className="material-symbols-outlined text-[12px] mr-1" aria-hidden="true">workspace_premium</span>Professional
                  </Badge>
                </Link>
              </div>
              {provider && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Signed in with</span>
                  <Badge variant="secondary" className="capitalize">
                    <span className="material-symbols-outlined text-[12px] mr-1" aria-hidden="true">
                      {provider === 'google' ? 'g_translate' : provider === 'github' ? 'code' : 'login'}
                    </span>
                    {provider}
                  </Badge>
                </div>
              )}
              {memberSince && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Member since</span>
                  <span className="text-sm font-medium text-foreground">
                    {new Date(memberSince).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700 px-6 pb-6">
            <p className="text-xs text-muted-foreground mb-3">
              {getRoleMessage(role)}
            </p>
            <div className="flex items-center justify-between gap-4">
              {role === 'ADMIN' ? (
                <Link href="/settings/team" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors">
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">group</span>
                  <span className="underline-offset-4 hover:underline">Team Settings</span>
                </Link>
              ) : (
                <Link href="/settings/security/mfa" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors">
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">lock</span>
                  <span className="underline-offset-4 hover:underline">Security</span>
                </Link>
              )}
              <Link href="/billing" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">credit_card</span>
                <span className="underline-offset-4 hover:underline">Billing</span>
              </Link>
            </div>
          </div>
        </Card>

        {/* ─── Row 2, Left: Basic Information ───────────────────────── */}
        <Card className="lg:col-span-8 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-[18px]">badge</span>
            </div>
            <h3 className="text-lg font-semibold text-foreground">Basic Information</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div className="space-y-2">
              <Label htmlFor="account-first-name" className="text-slate-700 dark:text-slate-300">First Name</Label>
              <Input
                id="account-first-name"
                type="text"
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); markDirty(); }}
                disabled={isSaving}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-last-name" className="text-slate-700 dark:text-slate-300">Last Name</Label>
              <Input
                id="account-last-name"
                type="text"
                value={lastName}
                onChange={(e) => { setLastName(e.target.value); markDirty(); }}
                disabled={isSaving}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="account-email" className="text-slate-700 dark:text-slate-300">Email Address</Label>
                <div className="flex items-center gap-1.5">
                  {emailVerified && (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 text-[10px] h-5">
                      <span className="material-symbols-outlined text-[12px] mr-0.5" aria-hidden="true">verified</span>
                      Verified
                    </Badge>
                  )}
                  <span className="text-xs font-medium text-slate-400 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">
                    Read-only
                  </span>
                </div>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <span className="material-symbols-outlined text-slate-400 text-[18px]">mail</span>
                </div>
                <Input
                  id="account-email"
                  type="email"
                  value={email}
                  disabled
                  readOnly
                  className="h-11 pl-10 pr-10 bg-slate-100 dark:bg-slate-800/50 text-slate-500 cursor-not-allowed"
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <span className="material-symbols-outlined text-slate-400 text-[18px]">lock</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-phone" className="text-slate-700 dark:text-slate-300">Phone Number</Label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <span className="material-symbols-outlined text-slate-400 text-[18px]">call</span>
                </div>
                <Input
                  id="account-phone"
                  type="tel"
                  placeholder="Add your phone number"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); markDirty(); }}
                  disabled={isSaving}
                  className="h-11 pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-company" className="text-slate-700 dark:text-slate-300">Company</Label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <span className="material-symbols-outlined text-slate-400 text-[18px]">apartment</span>
                </div>
                <Input
                  id="account-company"
                  type="text"
                  placeholder="Add your company"
                  value={company}
                  onChange={(e) => { setCompany(e.target.value); markDirty(); }}
                  disabled={isSaving}
                  className="h-11 pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-department" className="text-slate-700 dark:text-slate-300">Department</Label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <span className="material-symbols-outlined text-slate-400 text-[18px]">work</span>
                </div>
                <Input
                  id="account-department"
                  type="text"
                  placeholder="Add your department"
                  value={department}
                  onChange={(e) => { setDepartment(e.target.value); markDirty(); }}
                  disabled={isSaving}
                  className="h-11 pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-location" className="text-slate-700 dark:text-slate-300">Location</Label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <span className="material-symbols-outlined text-slate-400 text-[18px]">location_on</span>
                </div>
                <Input
                  id="account-location"
                  type="text"
                  placeholder="Add your location"
                  value={location}
                  onChange={(e) => { setLocation(e.target.value); markDirty(); }}
                  disabled={isSaving}
                  className="h-11 pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-website" className="text-slate-700 dark:text-slate-300">Website</Label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <span className="material-symbols-outlined text-slate-400 text-[18px]">language</span>
                </div>
                <Input
                  id="account-website"
                  type="url"
                  placeholder="Add your website"
                  value={website}
                  onChange={(e) => { setWebsite(e.target.value); markDirty(); }}
                  disabled={isSaving}
                  className="h-11 pl-10"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* ─── Row 2, Right: Appearance ──────────────────────────────── */}
        <Card className="lg:col-span-4 p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-violet-600 dark:text-violet-400 text-[18px]">palette</span>
            </div>
            <h3 className="text-lg font-semibold text-foreground">Appearance</h3>
          </div>

          <div className="space-y-5">
            {/* Theme selector */}
            <div className="space-y-3">
              <Label className="text-slate-700 dark:text-slate-300">Theme</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['light', 'dark', 'system'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTheme(t)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-colors text-xs font-medium ${
                      theme === t
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-slate-200 dark:border-slate-700 text-muted-foreground hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {getThemeIcon(t)}
                    </span>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Language</Label>
              <Select value={language} onValueChange={(v) => { setLanguage(v); markDirty(); }}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en-US">English (US)</SelectItem>
                  <SelectItem value="en-GB">English (UK)</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="pt-BR">Portuguese (BR)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Density */}
            <div className="space-y-3">
              <Label className="text-slate-700 dark:text-slate-300">Density</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'comfortable', icon: 'view_agenda', label: 'Comfortable' },
                  { value: 'compact', icon: 'view_headline', label: 'Compact' },
                ] as const).map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    className="flex flex-col items-center gap-1.5 p-2.5 rounded-lg border-2 transition-colors text-xs font-medium border-slate-200 dark:border-slate-700 text-muted-foreground hover:border-slate-300 dark:hover:border-slate-600 first:border-primary first:bg-primary/5 first:text-primary"
                  >
                    <span className="material-symbols-outlined text-[18px]">{d.icon}</span>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Accessibility toggles */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Reduce motion</p>
                  <p className="text-xs text-muted-foreground">Minimize animations</p>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Sidebar collapsed</p>
                  <p className="text-xs text-muted-foreground">Start with sidebar closed</p>
                </div>
                <Switch />
              </div>
            </div>
          </div>
        </Card>

        {/* ─── Row 3, Left: Regional & Format Preferences ───────────── */}
        <Card className="lg:col-span-6 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[18px]">public</span>
            </div>
            <h3 className="text-lg font-semibold text-foreground">Regional Preferences</h3>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Timezone</Label>
              <p className="text-xs text-muted-foreground">
                Used for greeting messages and time-sensitive displays
              </p>
              <TimezoneSelector
                value={timezone}
                onChange={(tz) => { setTimezone(tz); markDirty(); }}
                disabled={isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Date Format</Label>
              <Select value={dateFormat} onValueChange={(v) => { setDateFormat(v); markDirty(); }}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (US)</SelectItem>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (EU/UK)</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (ISO)</SelectItem>
                  <SelectItem value="DD.MM.YYYY">DD.MM.YYYY (DE)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* ─── Row 3, Right: Notification Quick Settings ─────────────── */}
        <Card className="lg:col-span-6 p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-rose-600 dark:text-rose-400 text-[18px]">notifications</span>
              </div>
              <h3 className="text-lg font-semibold text-foreground">Notifications</h3>
            </div>
            <Link href="/notifications/settings" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
              <span className="underline-offset-4 hover:underline">All settings</span>
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">arrow_forward</span>
            </Link>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[20px]">mail</span>
                <div>
                  <p className="text-sm font-medium text-foreground">Email Notifications</p>
                  <p className="text-xs text-muted-foreground">Receive updates via email</p>
                </div>
              </div>
              <Switch
                checked={emailNotifications}
                onCheckedChange={(v) => { setEmailNotifications(v); markDirty(); }}
              />
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700" />
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[20px]">computer</span>
                <div>
                  <p className="text-sm font-medium text-foreground">Desktop Notifications</p>
                  <p className="text-xs text-muted-foreground">Show browser push notifications</p>
                </div>
              </div>
              <Switch
                checked={desktopNotifications}
                onCheckedChange={(v) => { setDesktopNotifications(v); markDirty(); }}
              />
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700" />
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[20px]">volume_up</span>
                <div>
                  <p className="text-sm font-medium text-foreground">Sound Alerts</p>
                  <p className="text-xs text-muted-foreground">Play sound on new notifications</p>
                </div>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </Card>

        {/* ─── Row 4: Security (full width) ──────────────────────────── */}
        <Card className="lg:col-span-12 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[18px]">lock</span>
            </div>
            <h3 className="text-lg font-semibold text-foreground">Security</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-[20px]">key</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm">Password</p>
                <p className="text-xs text-muted-foreground">Manage your password</p>
              </div>
              <Button variant="link" asChild className="h-auto p-0 text-sm font-semibold shrink-0">
                <Link href="/settings/security/mfa">Change</Link>
              </Button>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-[20px]">smartphone</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm">Two-Factor Auth</p>
                <p className="text-xs text-muted-foreground">Extra layer of security</p>
              </div>
              <Button variant="link" asChild className="h-auto p-0 text-sm font-semibold shrink-0">
                <Link href="/settings/security/mfa">Manage</Link>
              </Button>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-[20px]">devices</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm">Active Sessions</p>
                <p className="text-xs text-muted-foreground">Manage active sessions</p>
              </div>
              <Button variant="link" asChild className="h-auto p-0 text-sm font-semibold shrink-0">
                <Link href="/settings/security/mfa">View</Link>
              </Button>
            </div>
          </div>
        </Card>

        {/* ─── Row 5: Footer Actions (full width) ───────────────────── */}
        <div className="lg:col-span-12 flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-200 dark:border-slate-700 mt-1">
          <div className="flex items-center gap-4">
            <Link href="/settings/security/mfa" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">lock</span>
              <span className="underline-offset-4 hover:underline">Security &amp; Password</span>
            </Link>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <Link href="/notifications/settings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">notifications</span>
              <span className="underline-offset-4 hover:underline">Notification Preferences</span>
            </Link>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <Link href="/settings/team" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">group</span>
              <span className="underline-offset-4 hover:underline">Team Settings</span>
            </Link>
          </div>

          <div className="flex gap-3 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={!isDirty || isSaving}
              className="flex-1 sm:flex-none px-6"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className="flex-1 sm:flex-none px-6"
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-sm" aria-hidden="true">progress_activity</span>Saving...
                </span>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </div>
      </div>

      <ProfilePhotoDialog
        open={photoDialogOpen}
        onOpenChange={setPhotoDialogOpen}
        userName={fullName}
        currentSrc={avatarSrc}
      />
    </div>
  );
}
