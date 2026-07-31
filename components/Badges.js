'use client';

export function StatusBadge({ status }) {
  const styles = {
    Verified: 'bg-good/15 text-good border-good/40',
    'Needs Review': 'bg-warn/15 text-warn border-warn/40',
    Rejected: 'bg-bad/15 text-bad border-bad/40',
    processing: 'bg-muted/15 text-muted border-muted/40',
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${styles[status] || styles.processing}`}>
      {status}
    </span>
  );
}

export function TrustBar({ score }) {
  const color = score >= 80 ? '#2fd480' : score >= 50 ? '#f5b642' : '#f5566a';
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-muted mb-1">
        <span>Trust Score</span>
        <span style={{ color }} className="font-semibold">{score}/100</span>
      </div>
      <div className="w-full h-2 rounded-full bg-line overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
