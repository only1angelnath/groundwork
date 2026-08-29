export function HeroPulse() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <svg
        viewBox="0 0 480 480"
        className="h-full w-full max-w-lg"
        role="img"
        aria-label="Animated illustration of a verification pulse"
      >
        <defs>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#E3C179" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#C08A2E" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* expanding pulse rings */}
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            cx="240"
            cy="240"
            r="40"
            fill="none"
            stroke="#C08A2E"
            strokeOpacity="0.25"
            strokeWidth="1.5"
            className="pulse-ring"
            style={{ animationDelay: `${i * 1.3}s` }}
          />
        ))}

        {/* static reference rings for structure */}
        <circle cx="240" cy="240" r="120" fill="none" stroke="#EAE7E0" strokeWidth="1" />
        <circle cx="240" cy="240" r="170" fill="none" stroke="#EAE7E0" strokeWidth="1" />

        {/* orbiting verification nodes */}
        <g className="orbit-slow" style={{ transformOrigin: "240px 240px" }}>
          <circle cx="240" cy="70" r="5" fill="#C08A2E" />
        </g>
        <g className="orbit-medium" style={{ transformOrigin: "240px 240px" }}>
          <circle cx="410" cy="240" r="4" fill="#E3C179" />
        </g>
        <g className="orbit-fast" style={{ transformOrigin: "240px 240px" }}>
          <circle cx="240" cy="360" r="3.5" fill="#C7C3BC" />
        </g>

        {/* core */}
        <circle cx="240" cy="240" r="90" fill="url(#coreGlow)" />
        <circle cx="240" cy="240" r="42" fill="#FDFCFA" stroke="#C08A2E" strokeWidth="1.5" />
        <path
          d="M222 240l12 12 24-28"
          fill="none"
          stroke="#C08A2E"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <style>{`
        .pulse-ring {
          animation: pulse-ring 3.9s ease-out infinite;
        }
        @keyframes pulse-ring {
          0% { r: 40; stroke-opacity: 0.5; }
          100% { r: 190; stroke-opacity: 0; }
        }
        .orbit-slow { animation: spin 14s linear infinite; }
        .orbit-medium { animation: spin 9s linear infinite reverse; }
        .orbit-fast { animation: spin 6s linear infinite; }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
