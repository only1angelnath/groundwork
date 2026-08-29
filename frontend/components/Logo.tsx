export function Logo({ size = 32 }: { size?: number }) {
  // viewBox is 32 wide x 70 tall — a tower silhouette, not a square icon.
  // `size` sets the rendered height; width follows the same aspect ratio.
  const width = Math.round(size * (32 / 70));

  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 32 70"
      role="img"
      aria-label="Groundwork logo"
    >
      {/* Top tier — brass gold: the unlocked/verified state the story
          builds toward. */}
      <polygon points="16,0 28,7 16,14 4,7" fill="#F0DFC0" />
      <polygon points="4,7 16,14 16,23 4,16" fill="#E3C179" />
      <polygon points="16,14 28,7 28,16 16,23" fill="#C08A2E" />

      {/* Middle tier — mid dusty-rose: history building. */}
      <polygon points="16,23 28,30 16,37 4,30" fill="#EFCFC5" />
      <polygon points="4,30 16,37 16,46 4,39" fill="#D9998A" />
      <polygon points="16,37 28,30 28,39 16,46" fill="#B97060" />

      {/* Bottom tier — darkest dusty-rose: the foundation, real payment
          history, where it all starts. */}
      <polygon points="16,46 28,53 16,60 4,53" fill="#C98577" />
      <polygon points="4,53 16,60 16,69 4,62" fill="#B97060" />
      <polygon points="16,60 28,53 28,62 16,69" fill="#9C5A4C" />
    </svg>
  );
}
