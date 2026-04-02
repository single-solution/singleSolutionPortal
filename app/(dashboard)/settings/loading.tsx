export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-5 animate-reveal">
      <div className="flex items-center gap-3">
        <div className="page-icon" style={{ background: "var(--primary-light)" }}>
          <svg fill="none" viewBox="0 0 24 24" stroke="var(--primary)">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-title">Account Settings</h1>
          <p className="text-subhead">Manage your profile, email, and password</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="card-xl p-6 sm:p-8 space-y-5">
          <span className="text-footnote font-semibold" style={{ color: "var(--fg-tertiary)" }}>Profile</span>
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
          <span className="text-footnote font-semibold" style={{ color: "var(--fg-tertiary)" }}>Email &amp; Password</span>
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
          <span className="text-footnote font-semibold" style={{ color: "var(--fg-tertiary)" }}>Preferences</span>
          <div className="shimmer h-3 w-48 rounded" />
          <div className="shimmer h-10 rounded" />
          <div className="shimmer h-10 rounded-xl" />
        </div>
        <div className="card-xl p-6 sm:p-8 space-y-4">
          <span className="text-footnote font-semibold" style={{ color: "var(--fg-tertiary)" }}>Test Email</span>
          <div className="shimmer h-3 w-44 rounded" />
          <div className="shimmer h-10 rounded" />
          <div className="shimmer h-10 rounded" />
          <div className="shimmer h-10 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
