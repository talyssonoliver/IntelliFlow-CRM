export default function PublicHomeLoading() {
  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-50 animate-pulse">
      <section className="relative overflow-hidden py-16 lg:py-24">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#0d1b2a] to-[#0b1f37]" />
        <div className="absolute -left-40 top-10 h-80 w-80 rounded-full bg-[#137fec]/30 blur-3xl opacity-60" />
        <div className="absolute right-0 bottom-0 h-96 w-96 rounded-full bg-indigo-500/30 blur-3xl opacity-50" />

        <div className="relative container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-10">
            <div className="space-y-6">
              <div className="w-64 h-9 bg-white/10 rounded-full" />
              <div className="h-12 bg-white/10 rounded-lg" />
              <div className="h-12 bg-white/10 rounded-lg w-5/6" />
              <div className="h-6 bg-white/10 rounded w-2/3" />
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="h-12 w-40 bg-[#137fec]/40 rounded-lg" />
                <div className="h-12 w-36 border border-white/20 rounded-lg" />
              </div>
              <div className="flex flex-wrap gap-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-8 w-40 bg-white/10 rounded-full" />
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="h-64 bg-white/5 rounded-2xl border border-white/10" />
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-20 bg-white/5 rounded-xl border border-white/10" />
                ))}
              </div>
              <div className="h-28 bg-white/5 rounded-xl border border-white/10" />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-10">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="h-4 w-48 bg-slate-200 rounded mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-10 bg-slate-100 rounded-lg" />
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-slate-50 text-slate-900">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl space-y-8">
          <div className="h-10 w-2/3 bg-slate-200 rounded" />
          <div className="h-4 w-1/2 bg-slate-200 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="p-6 bg-white rounded-xl border border-slate-200 space-y-4">
                <div className="h-12 w-12 bg-slate-200 rounded-lg" />
                <div className="h-6 w-2/3 bg-slate-200 rounded" />
                <div className="h-4 w-full bg-slate-200 rounded" />
                <div className="h-4 w-5/6 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white text-slate-900">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl space-y-8">
          <div className="h-10 w-2/3 bg-slate-200 rounded" />
          <div className="h-4 w-1/2 bg-slate-200 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="p-6 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                <div className="h-12 w-12 bg-slate-200 rounded-lg" />
                <div className="h-6 w-3/4 bg-slate-200 rounded" />
                <div className="h-4 w-full bg-slate-200 rounded" />
                <div className="h-4 w-4/5 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-slate-900 text-white">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl space-y-8">
          <div className="h-10 w-2/3 bg-white/20 rounded" />
          <div className="h-4 w-1/2 bg-white/20 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="p-6 bg-white/10 rounded-xl border border-white/10 space-y-4">
                <div className="h-10 w-10 bg-white/20 rounded-full" />
                <div className="h-6 w-2/3 bg-white/20 rounded" />
                <div className="h-4 w-full bg-white/20 rounded" />
                <div className="h-4 w-4/5 bg-white/20 rounded" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white text-slate-900">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl space-y-8">
          <div className="h-10 w-2/3 bg-slate-200 rounded" />
          <div className="h-4 w-1/2 bg-slate-200 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="p-6 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                <div className="h-6 w-16 bg-slate-200 rounded" />
                <div className="h-4 w-full bg-slate-200 rounded" />
                <div className="h-4 w-4/5 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-gradient-to-r from-[#137fec] to-[#0e6ac7] text-white">
        <div className="container px-4 lg:px-6 mx-auto max-w-5xl space-y-4">
          <div className="h-10 w-3/4 bg-white/40 rounded" />
          <div className="h-4 w-2/3 bg-white/30 rounded" />
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="h-12 w-44 bg-white/80 rounded-lg" />
            <div className="h-12 w-40 border border-white/60 rounded-lg" />
          </div>
        </div>
      </section>
    </div>
  );
}
