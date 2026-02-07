'use client';

import Link from 'next/link';

type Props = {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  secondary?: boolean;
  className?: string;
};

export function ShinyBorderButton({
  children,
  href,
  onClick,
  disabled,
  secondary,
  className = '',
}: Props) {
  const inner = (
    <span className="shiny-border-inner">
      {children}
    </span>
  );

  const wrapperClass = `shiny-border-btn ${secondary ? 'shiny-border-btn-secondary' : ''} ${className}`.trim();

  if (href && !disabled) {
    return (
      <Link href={href} className={wrapperClass}>
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={wrapperClass}
      onClick={onClick}
      disabled={disabled}
    >
      {inner}
    </button>
  );
}
