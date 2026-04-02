export default function CampaignsLoading() {
  return (
    <div className="flex flex-col gap-0 animate-reveal">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-title">Campaigns</h1>
          <div className="shimmer mt-1 h-3 w-44 max-w-[90vw] rounded" />
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
          <span className="rounded-md px-2.5 py-1 text-xs font-semibold" style={{ background: "var(--bg-elevated)", color: "var(--fg)" }}>Recent</span>
          <span className="rounded-md px-2.5 py-1 text-xs font-medium" style={{ color: "var(--fg-tertiary)" }}>A – Z</span>
        </div>
      </div>
      <div className="card-static mb-3 flex items-center gap-3 p-3">
        <input className="input flex-1" placeholder="Search campaigns..." disabled readOnly />
        <span className="btn btn-primary shrink-0">New Campaign</span>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
          {["All", "Active", "Paused", "Completed", "Cancelled"].map((label) => (
            <span key={label} className="rounded-md px-2.5 py-1 text-xs font-medium" style={{ color: "var(--fg-tertiary)" }}>{label}</span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="card flex h-full flex-col overflow-hidden">
            <div className="flex-1 p-2.5">
              <div className="flex items-center justify-between">
                <div className="shimmer h-3.5 w-28 rounded" />
                <div className="shimmer h-4 w-14 rounded-full" />
              </div>
              <div className="shimmer mt-0.5 h-2.5 w-full max-w-[160px] rounded" />
              <div className="mt-1.5 space-y-0.5">
                <div className="flex items-center justify-between">
                  <div className="shimmer h-2.5 w-14 rounded" />
                  <div className="shimmer h-2.5 w-32 rounded" />
                </div>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  <div className="shimmer h-4 w-14 rounded-full" />
                  <div className="shimmer h-4 w-16 rounded-full" />
                </div>
              </div>
              <div className="mt-1 flex gap-1">
                <div className="shimmer h-5 w-12 rounded-md" />
                <div className="shimmer h-5 w-14 rounded-md" />
              </div>
            </div>
            <div className="flex items-center justify-between border-t px-2.5 py-1.5" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2">
                <div className="shimmer h-5 w-10 rounded-full" />
                <div className="shimmer h-2.5 w-24 rounded" />
              </div>
              <div className="flex items-center gap-1">
                <div className="shimmer h-6 w-6 rounded-lg" />
                <div className="shimmer h-6 w-6 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
