export default function TeamsLoading() {
  return (
    <div className="flex flex-col gap-0 animate-reveal">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="shimmer h-8 w-32 rounded" />
          <div className="shimmer h-4 w-48 max-w-[90vw] rounded" />
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
          <div className="shimmer h-7 w-28 rounded-md" />
          <div className="shimmer h-7 w-16 rounded-md" />
        </div>
      </div>
      <div className="card-static mb-4 flex items-center gap-3 p-4">
        <div className="relative h-10 flex-1">
          <div className="shimmer h-10 w-full rounded-lg" />
        </div>
        <div className="shimmer h-9 w-32 shrink-0 rounded-lg" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
          <div className="shimmer h-7 w-20 rounded-md" />
          <div className="shimmer h-7 w-24 rounded-md" />
          <div className="shimmer h-7 w-20 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="card card-shine flex h-full flex-col overflow-hidden">
            <div className="flex-1 p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <div className="shimmer h-10 w-10 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="shimmer h-4 w-32 rounded" />
                  <div className="shimmer h-3 w-28 rounded" />
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="shimmer h-3 w-10 rounded" />
                  <div className="shimmer h-3 w-24 rounded" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="shimmer h-3 w-12 rounded" />
                  <div className="shimmer h-3 w-36 rounded" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="shimmer h-3 w-16 rounded" />
                  <div className="shimmer h-5 w-8 rounded-full" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t px-3 py-2.5 sm:px-4" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2">
                <div className="shimmer h-7 w-12 rounded-full" />
                <div className="shimmer h-3 w-28 rounded" />
              </div>
              <div className="flex items-center gap-1">
                <div className="shimmer h-7 w-7 rounded-lg" />
                <div className="shimmer h-7 w-7 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
