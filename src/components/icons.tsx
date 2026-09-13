import type { SVGProps } from "react";

/**
 * House icon set — drawn on a 24px grid with a 1.25 stroke so the chrome stays
 * lighter than the typography. Decorative by default; label the control, not the icon.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, strokeWidth = 1.25, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      width="1em"
      height="1em"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10.5" cy="10.5" r="6.25" />
      <path d="M15.25 15.25 20 20" />
    </Icon>
  );
}

export function BagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.25 8.25h13.5l-1 11.5H6.25z" />
      <path d="M9 8.25V6.75a3 3 0 0 1 6 0v1.5" />
    </Icon>
  );
}

export function AccountIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.75c1.25-3.5 3.9-5.25 7-5.25s5.75 1.75 7 5.25" />
    </Icon>
  );
}

export function HeartIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Icon fill={filled ? "currentColor" : "none"} {...props}>
      <path d="M12 19.75s-7.25-4.4-7.25-9.8A4 4 0 0 1 12 7.6a4 4 0 0 1 7.25 2.35c0 5.4-7.25 9.8-7.25 9.8z" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

/** Two-line menu glyph — quieter than the usual three. */
export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.75 9h16.5M3.75 15h16.5" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5.5v13M5.5 12h13" />
    </Icon>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 12h13" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m14.5 6.5-5.5 5.5 5.5 5.5" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9.5 6.5 5.5 5.5-5.5 5.5" />
    </Icon>
  );
}

/** Long editorial arrow, used after CTAs. Wider than tall on purpose. */
export function ArrowRightIcon({ strokeWidth = 1.25, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 28 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      width="1.75em"
      height="0.75em"
      {...props}
    >
      <path d="M1 6h25M21.5 1.5 26 6l-4.5 4.5" />
    </svg>
  );
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.5 16.5 16.5 7.5M9 7.5h7.5V15" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5.5 12.5 4 4 9-9" />
    </Icon>
  );
}
