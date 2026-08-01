// PLACEHOLDER — the real parent dashboard isn't built yet. This exists only
// so `npm run build` doesn't fail on the missing import while that feature
// is in progress. Replace with the real implementation when ready; nothing
// else (routing, ParentAuth, ProtectedParent) needs to change when you do.
export default function ParentDashboard() {
  return (
    <div className="bg-ink min-h-[calc(100vh-4rem)] flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-mint mb-3">Coming soon</p>
        <h1 className="font-display text-2xl font-bold text-paper mb-2">Parent Dashboard</h1>
        <p className="text-paper/50 text-sm">This page is still being built.</p>
      </div>
    </div>
  )
}
