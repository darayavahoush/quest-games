// Shared ambient background glow for authenticated dashboard-style pages.
// Previously hand-duplicated in Dashboard.jsx (one blob, top-right) and
// PatientDetail.jsx (two blobs, top-left/right) with slightly different
// colors/positions each time they were written — one component means
// every page that uses it looks deliberately consistent rather than each
// author's own eyeballed version of "some glow in the corner."
export default function AmbientGlow() {
  return (
    <div className="absolute top-0 left-0 w-full h-80 overflow-hidden pointer-events-none">
      <div className="absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full bg-brand-teal/[0.07] blur-[100px]" />
      <div className="absolute -top-40 right-0 w-[26rem] h-[26rem] rounded-full bg-brand-green/[0.05] blur-[100px]" />
    </div>
  )
}
