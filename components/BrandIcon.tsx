export function BrandIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 2.5L16.75 7L20.5 12L16.75 16.25L12 21.5L7.25 16.25L3.5 12L7.25 7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="miter"
      />
      <path
        d="M7.25 7H16.75M3.5 12H20.5M7.25 16.25H16.75M12 2.5V21.5M7.25 7L12 16.25M16.75 7L12 16.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
