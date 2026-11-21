export function LogoMark({ className = '' }: { className?: string }) {
  return (
    <img
      className={className}
      src="/favicon.svg"
      alt=""
      aria-hidden="true"
      width="64"
      height="64"
    />
  )
}
