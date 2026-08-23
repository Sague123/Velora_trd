export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="6" fill="#0b0e14" />
      <path d="M8 9l8 15 8-15h-3.4L16 19.6 10.4 9H8z" fill="#17c885" />
    </svg>
  );
}
