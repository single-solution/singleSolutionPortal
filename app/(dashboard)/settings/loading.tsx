export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-5 animate-reveal">
      <div className="flex items-center gap-3">
        <div className="shimmer h-11 w-11 rounded-xl" />
        <div className="space-y-2">
          <div className="shimmer h-5 w-40 rounded" />
          <div className="shimmer h-3 w-60 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="card-xl p-6 sm:p-8 space-y-5">
          <div className="shimmer h-4 w-16 rounded" />
          <div className="flex items-center gap-4">
            <div className="shimmer h-14 w-14 rounded-2xl shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="shimmer h-4 w-32 rounded" />
              <div className="shimmer h-3 w-40 rounded" />
              <div className="flex gap-1.5">
                <div className="shimmer h-4 w-14 rounded-full" />
                <div className="shimmer h-4 w-16 rounded-full" />
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="shimmer h-3 w-16 rounded" />
            <div className="shimmer h-10 rounded" />
          </div>
          <div className="space-y-3">
            <div className="shimmer h-3 w-12 rounded" />
            <div className="shimmer h-10 rounded" />
          </div>
          <div className="shimmer h-10 rounded-xl" />
        </div>
        <div className="card-xl p-6 sm:p-8 space-y-5">
          <div className="shimmer h-4 w-32 rounded" />
          <div className="space-y-3">
            <div className="shimmer h-3 w-28 rounded" />
            <div className="shimmer h-10 rounded" />
          </div>
          <div className="shimmer h-px w-full rounded" style={{ opacity: 0.3 }} />
          <div className="space-y-3">
            <div className="shimmer h-3 w-20 rounded" />
            <div className="shimmer h-10 rounded" />
          </div>
          <div className="space-y-3">
            <div className="shimmer h-3 w-24 rounded" />
            <div className="shimmer h-10 rounded" />
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="shimmer h-1 flex-1 rounded-full" />
              ))}
            </div>
          </div>
          <div className="shimmer h-10 rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="card-xl p-6 sm:p-8 space-y-4">
          <div className="shimmer h-3 w-20 rounded" />
          <div className="shimmer h-3 w-48 rounded" />
          <div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--glass-bg)" }}>
            <div className="shimmer h-7 w-20 rounded-md" />
            <div className="shimmer h-7 w-24 rounded-md" />
            <div className="shimmer h-7 w-28 rounded-md" />
          </div>
          <div className="shimmer h-10 rounded" />
          <div className="shimmer h-10 rounded-xl" />
        </div>
        <div className="card-xl p-6 sm:p-8 space-y-4">
          <div className="shimmer h-3 w-16 rounded" />
          <div className="shimmer h-3 w-44 rounded" />
          <div className="shimmer h-10 rounded" />
          <div className="shimmer h-10 rounded" />
          <div className="shimmer h-10 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
