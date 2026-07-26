const SEGMENT_COLORS = ["var(--primary)", "var(--muted-foreground)", "var(--destructive)", "#f59e0b"];

/** Static SVG ring — no charting dependency for one shape used in one place. */
export function DonutChart({ segments }: { segments: { label: string; value: number }[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--muted)" strokeWidth="14" />
        {total > 0 &&
          segments.map((segment, i) => {
            const fraction = segment.value / total;
            const dash = fraction * circumference;
            const circle = (
              <circle
                key={segment.label}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={SEGMENT_COLORS[i % SEGMENT_COLORS.length]}
                strokeWidth="14"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return circle;
          })}
      </svg>
      <ul className="grid gap-2 text-sm">
        {segments.map((segment, i) => (
          <li key={segment.label} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
            />
            <span className="text-muted-foreground">{segment.label}</span>
            <span className="font-medium">{total > 0 ? Math.round((segment.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
