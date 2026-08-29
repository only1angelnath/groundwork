export function BrandMotion() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="drift-a absolute left-[10%] top-[10%] h-72 w-72 rounded-full bg-pink-400/20 blur-[90px]" />
      <div className="drift-b absolute right-[8%] top-[30%] h-64 w-64 rounded-full bg-brass-300/20 blur-[90px]" />
      <div className="drift-c absolute bottom-[5%] left-[35%] h-80 w-80 rounded-full bg-pink-500/15 blur-[100px]" />

      <style>{`
        .drift-a { animation: drift-a 14s ease-in-out infinite; }
        .drift-b { animation: drift-b 18s ease-in-out infinite; }
        .drift-c { animation: drift-c 16s ease-in-out infinite; }
        @keyframes drift-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, 30px) scale(1.15); }
        }
        @keyframes drift-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-30px, 40px) scale(1.1); }
        }
        @keyframes drift-c {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(20px, -35px) scale(1.12); }
        }
      `}</style>
    </div>
  );
}
