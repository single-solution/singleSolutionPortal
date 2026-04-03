function Bone({ w = "w-10", h = "h-3" }: { w?: string; h?: string }) {
  return <span className={`shimmer inline-block rounded ${w} ${h}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-5 animate-reveal">
      {/* Welcome header skeleton */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>Single Solution Sync</p>
          <div className="flex items-center gap-2">
            <Bone w="w-32" h="h-7" />
            <Bone w="w-24" h="h-7" />
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Bone w="w-20" h="h-4" />
            <Bone w="w-16" h="h-4" />
            <Bone w="w-16" h="h-4" />
          </div>
        </div>
        <div className="card p-4 sm:min-w-[220px] shrink-0">
          <p className="text-caption mb-1" style={{ color: "var(--fg-tertiary)" }}>Local time</p>
          <Bone w="w-24" h="h-7" />
          <Bone w="w-20" h="h-3" />
        </div>
      </header>

      {/* Self overview + Timeline row skeleton */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Self Overview */}
        <div className="card p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            <div className="flex flex-col items-center gap-3 sm:items-start">
              <div className="shimmer h-20 w-20 rounded-full sm:h-24 sm:w-24" />
              <Bone w="w-16" h="h-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-1">
                <Bone w="w-40" h="h-5" />
                <Bone w="w-28" h="h-3" />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="card-static rounded-xl p-3 space-y-1.5">
                    <Bone w="w-16" h="h-3" />
                    <Bone w="w-12" h="h-4" />
                  </div>
                ))}
              </div>
              <Bone w="w-full" h="h-2.5" />
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="card-static flex flex-col p-5 sm:p-6">
          <h3 className="text-section-header mb-4">Today&apos;s Activity</h3>
          <ul className="relative flex flex-col gap-0 pl-4">
            <span className="absolute bottom-1 left-[7px] top-1 w-px" style={{ background: "var(--border-strong)" }} aria-hidden />
            {[1, 2, 3].map((i) => (
              <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
                <span className="shimmer mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Bone w="w-12" h="h-2.5" />
                  <Bone w="w-32" h="h-3" />
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t pt-3 mt-auto" style={{ borderColor: "var(--border)" }}>
            <h4 className="text-callout font-semibold mb-2" style={{ color: "var(--fg)" }}>My Tasks</h4>
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-2">
                  <Bone w="w-2" h="h-2" />
                  <div className="flex-1 space-y-1">
                    <Bone w="w-28" h="h-2.5" />
                    <Bone w="w-20" h="h-2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Campaigns + Tasks row skeleton */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="card p-4 sm:p-5 lg:col-span-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-headline" style={{ color: "var(--fg)" }}>Active Campaigns</h3>
            <Bone w="w-14" h="h-3" />
          </div>
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: "var(--bg-grouped)" }}>
                <div className="shimmer h-8 w-8 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Bone w="w-32" h="h-3.5" />
                  <Bone w="w-20" h="h-2.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-4 sm:p-5 lg:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-headline" style={{ color: "var(--fg)" }}>Checklist</h3>
            <Bone w="w-16" h="h-5" />
          </div>
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="shimmer mt-0.5 h-8 w-8 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Bone w="w-40" h="h-3.5" />
                  <Bone w="w-24" h="h-2.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Presence skeleton */}
      <div className="card p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ backgroundColor: "var(--teal)" }} />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--teal)" }} />
            </span>
            <h2 className="text-headline" style={{ color: "var(--fg)" }}>Team Status</h2>
          </div>
          <div className="flex flex-wrap gap-1 rounded-xl p-1" style={{ background: "var(--bg-grouped)" }}>
            {["All", "In Office", "Remote", "Late", "Absent"].map((f) => (
              <span key={f} className="rounded-lg px-3 py-1.5 text-caption font-semibold" style={{ color: "var(--fg-tertiary)" }}>{f}</span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 md:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card flex flex-col overflow-hidden">
              <div className="flex-1 p-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="shimmer h-7 w-7 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <Bone w="w-20" h="h-3.5" />
                  </div>
                  <Bone w="w-14" h="h-4" />
                </div>
                <Bone w="w-28" h="h-2.5" />
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between">
                    <Bone w="w-12" h="h-2.5" />
                    <Bone w="w-16" h="h-2.5" />
                  </div>
                  <Bone w="w-full" h="h-1.5" />
                </div>
              </div>
              <div className="flex items-center gap-2 border-t px-2.5 py-1.5" style={{ borderColor: "var(--border)" }}>
                <Bone w="w-10" h="h-4" />
                <Bone w="w-16" h="h-2.5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
