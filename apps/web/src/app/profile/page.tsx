'use client';

import Link from 'next/link';
import { Card } from '@intelliflow/ui';

export default function ProfilePage() {
  return (
    <div className="container mx-auto px-6 py-8">
      <div className="max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Profile</h1>
          <p className="text-muted-foreground mt-1">
            Your public profile information
          </p>
        </div>

        {/* Profile Card */}
        <Card className="p-6">
          <div className="flex items-center gap-6 mb-6">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <span className="text-2xl font-bold text-muted-foreground">A</span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Alex Johnson</h2>
              <p className="text-muted-foreground">alex@intelliflow.ai</p>
              <span className="inline-block mt-2 px-3 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full">
                Admin
              </span>
            </div>
          </div>

          <div className="space-y-4 pt-6 border-t border-border">
            <div>
              <p className="text-sm text-muted-foreground">Member since</p>
              <p className="font-medium text-foreground">December 2025</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Department</p>
              <p className="font-medium text-foreground">Engineering</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Location</p>
              <p className="font-medium text-foreground">London, UK</p>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-border">
            <Link
              href="/settings/account"
              className="inline-flex items-center gap-2 text-primary hover:underline text-sm font-medium"
            >
              <span className="material-symbols-outlined text-lg">settings</span>
              Edit Profile Settings
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
