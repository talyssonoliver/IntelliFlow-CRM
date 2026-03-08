'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, toast } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { TimezoneSelector } from '@/components/settings/TimezoneSelector';

export default function AccountPage() {
  const profileQuery = trpc.user.getProfile.useQuery(undefined, {
    retry: false,
  });
  const updateTimezoneMutation = trpc.user.updateTimezone.useMutation({
    onSuccess: () => {
      toast({ description: 'Timezone updated successfully' });
      profileQuery.refetch();
    },
    onError: (error) => {
      toast({ description: error.message ?? 'Failed to update timezone' });
    },
  });

  const [selectedTimezone, setSelectedTimezone] = useState('UTC');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');

  useEffect(() => {
    if (profileQuery.data) {
      setSelectedTimezone(String(profileQuery.data.timezone ?? 'UTC'));
      setName(String(profileQuery.data.name ?? ''));
      setEmail(String(profileQuery.data.email ?? ''));
      setRole(String(profileQuery.data.role ?? ''));
    }
  }, [profileQuery.data]);

  const handleSaveTimezone = () => {
    updateTimezoneMutation.mutate({ timezone: selectedTimezone });
  };

  const isLoading = profileQuery.isLoading;
  const isSaving = updateTimezoneMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Link href="/settings" className="hover:text-primary">
              Settings
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Account</span>
          </nav>
          <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your personal information and security settings
          </p>
        </div>

        {/* Profile Section */}
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Profile Information</h2>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="account-full-name"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Full Name
              </label>
              <input
                id="account-full-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label
                htmlFor="account-email"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Email
              </label>
              <input
                id="account-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label
                htmlFor="account-role"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Role
              </label>
              <input
                id="account-role"
                type="text"
                value={role}
                disabled
                className="w-full px-3 py-2 border border-input rounded-lg bg-muted text-muted-foreground cursor-not-allowed"
              />
            </div>
          </div>
        </Card>

        {/* Preferences Section */}
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Preferences</h2>
          <div className="space-y-4">
            <div>
              <span className="block text-sm font-medium text-foreground mb-1">Timezone</span>
              <p className="text-sm text-muted-foreground mb-2">
                Used for greeting messages and time-sensitive displays
              </p>
              <TimezoneSelector
                value={selectedTimezone}
                onChange={setSelectedTimezone}
                disabled={isLoading || isSaving}
              />
            </div>
          </div>
          <div className="mt-6">
            <button
              onClick={handleSaveTimezone}
              disabled={isSaving || isLoading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </Card>

        {/* Security Section */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Security</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-border">
              <div>
                <p className="font-medium text-foreground">Password</p>
                <p className="text-sm text-muted-foreground">Last changed 30 days ago</p>
              </div>
              <button className="text-primary text-sm font-medium hover:underline">Change</button>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-border">
              <div>
                <p className="font-medium text-foreground">Two-Factor Authentication</p>
                <p className="text-sm text-muted-foreground">
                  {/* Dynamic status — PG-125 AC-006 */}
                  Add an extra layer of security
                </p>
              </div>
              <Link
                href="/settings/security/mfa"
                className="text-primary text-sm font-medium hover:underline"
              >
                Manage
              </Link>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-foreground">Sessions</p>
                <p className="text-sm text-muted-foreground">Manage your active sessions</p>
              </div>
              <button className="text-primary text-sm font-medium hover:underline">View</button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
