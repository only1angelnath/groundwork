"use client";

const COLS = 7;
const ROWS = 6;
const ACCENT_TILES = new Set(["0-0", "6-0", "0-5", "6-5"]);

export function TileGridBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Ripple rings, expanding outward from the grid center — echoes
          Avon's water-ripple hero. Also drives the glow that washes up
          onto the headline text above. */}
      <div className="absolute left-1/2 top-[60%] -translate-x-1/2 -translate-y-1/2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="ripple absolute left-1/2 top-1/2 rounded-full border border-pink-400/40"
            style={{ animationDelay: `${i * 1.6}s` }}
          />
        ))}
      </div>

      {/* Soft glow synced to the ripple cadence, reaching up under the
          text so the headline appears to catch light from the animation
          below it. */}
      <div
        className="text-glow absolute left-1/2 top-[38%] h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-400/25 blur-[80px]"
      />

      <div
        className="absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_55%_45%_at_50%_78%,black,transparent)]"
        style={{ perspective: "1400px" }}
      >
        <div
          className="absolute left-1/2 top-[78%] grid -translate-x-1/2 -translate-y-1/2 gap-3"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 4.2rem)`,
            gridTemplateRows: `repeat(${ROWS}, 4.2rem)`,
            transform: "rotateX(58deg) rotateZ(-35deg)",
          }}
        >
          {Array.from({ length: COLS * ROWS }, (_, i) => {
            const x = i % COLS;
            const y = Math.floor(i / COLS);
            const isAccent = ACCENT_TILES.has(`${x}-${y}`);
            return (
              <div
                key={i}
                className={`tile rounded-xl ${
                  isAccent ? "bg-pink-400/70" : "bg-cream-100/70"
                }`}
                style={{ animationDelay: `${(x + y) * 0.12}s` }}
              />
            );
          })}
        </div>
      </div>

      <style>{`
        .tile {
          animation: tile-breathe 4s ease-in-out infinite;
        }
        @keyframes tile-breathe {
          0%, 100% { transform: translateZ(0px) scale(1); opacity: 0.8; }
          50% { transform: translateZ(14px) scale(1.04); opacity: 1; }
        }
        .ripple {
          width: 40px;
          height: 40px;
          animation: ripple-out 4.8s ease-out infinite;
        }
        @keyframes ripple-out {
          0% { width: 40px; height: 40px; opacity: 0.5; }
          100% { width: 680px; height: 680px; opacity: 0; }
        }
        .text-glow {
          animation: glow-pulse 4.8s ease-in-out infinite;
        }
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(0.9); }
          50% { opacity: 0.9; transform: translate(-50%, -50%) scale(1.15); }
        }
      `}</style>
    </div>
  );
}
