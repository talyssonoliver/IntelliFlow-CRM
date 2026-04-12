import { Skeleton, Card } from '@intelliflow/ui';

export function AccountSettingsLoading() {
  return (
    <div className="pb-10">
      {/* Header */}
      <div className="mb-6">
        <Skeleton className="h-4 w-56 mb-1" />
        <Skeleton className="h-9 w-52 mb-2" />
        <Skeleton className="h-5 w-96" />
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Row 1: Profile card + Quick info */}
        <Card className="lg:col-span-8 overflow-hidden">
          <Skeleton className="h-28 w-full rounded-none" />
          <div className="px-6 pb-6 -mt-12 flex items-end gap-5 pt-0 relative">
            <Skeleton className="w-24 h-24 rounded-full border-4 border-white dark:border-slate-900 shrink-0" />
            <div className="pb-1 space-y-2 flex-1">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
        </Card>
        <Card className="lg:col-span-4 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </div>
        </Card>

        {/* Row 2: Basic info + Preferences */}
        <Card className="lg:col-span-8 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-6">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="h-5 w-36" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-11 w-full" />
              </div>
            ))}
          </div>
        </Card>
        <Card className="lg:col-span-4 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="h-5 w-28" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </Card>

        {/* Row 3: Account details + Security */}
        <Card className="lg:col-span-5 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-6">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="space-y-5">
            {[1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-11 w-full" />
              </div>
            ))}
          </div>
        </Card>
        <Card className="lg:col-span-7 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-6">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </Card>

        {/* Footer */}
        <div className="lg:col-span-12 flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700 mt-1">
          <Skeleton className="h-5 w-64" />
          <div className="flex gap-3">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}
