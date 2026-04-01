export default function DepartmentsLoading() {
  return (
    <div className="flex flex-col gap-0 animate-reveal">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="shimmer h-7 w-40 rounded" />
          <div className="shimmer h-3 w-48 max-w-[90vw] rounded" />
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
          <div className="shimmer h-6 w-24 rounded-md" />
          <div className="shimmer h-6 w-14 rounded-md" />
        </div>
      </div>
      <div className="card-static mb-3 flex items-center gap-3 p-3">
        <div className="shimmer h-9 flex-1 rounded-lg" />
        <div className="shimmer h-8 w-36 shrink-0 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="card flex h-full flex-col overflow-hidden">
            <div className="flex-1 p-2.5">
              <div className="shimmer h-3.5 w-24 rounded" />
              <div className="shimmer mt-0.5 h-2.5 w-20 rounded" />
              <div className="mt-1.5">
                <div className="shimmer h-2.5 w-32 rounded" />
              </div>
              <div className="shimmer mt-1 h-2.5 w-full rounded" />
              <div className="shimmer mt-1 h-2.5 w-20 rounded" />
            </div>
            <div className="flex items-center justify-between border-t px-2.5 py-1.5" style={{ borderColor: "var(--border)" }}>
              <div className="shimmer h-5 w-10 rounded-full" />
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
