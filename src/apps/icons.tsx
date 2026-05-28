/**
 * Bespoke app icons. Each component renders a centered SVG glyph designed for
 * its app — meant to feel like an iOS app icon. The dock + spotlight already
 * place these inside a squircle with the manifest's `accent` gradient, so we
 * only draw the white glyph and let the chrome supply the colored backdrop.
 *
 * Every icon accepts the standard IconProps {size, className} shape so it
 * plugs in wherever a Lucide icon used to.
 */
import type { ComponentProps, FC } from 'react';

type IconProps = {
  size?: number | string;
  className?: string;
} & ComponentProps<'svg'>;

const Glyph: FC<IconProps & { children: React.ReactNode }> = ({
  size = 18,
  className,
  children,
  ...rest
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...rest}
  >
    {children}
  </svg>
);

export const HelloIcon: FC<IconProps> = (p) => (
  <Glyph {...p}>
    <path d="M5 19c2-3 4-3 6 0 2-3 4-3 6 0 2-3 4-3 6 0" />
    <circle cx="11" cy="11" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="21" cy="11" r="1.4" fill="currentColor" stroke="none" />
  </Glyph>
);

/* Calculator: a calculator with a display and 3×3 buttons. */
export const CalculatorIcon: FC<IconProps> = (p) => (
  <Glyph {...p}>
    <rect x="6" y="4" width="20" height="24" rx="4" />
    <rect x="9" y="7" width="14" height="5" rx="1.4" fill="currentColor" stroke="none" opacity="0.55" />
    <circle cx="11" cy="17" r="1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="17" r="1" fill="currentColor" stroke="none" />
    <circle cx="21" cy="17" r="1" fill="currentColor" stroke="none" />
    <circle cx="11" cy="21" r="1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="21" r="1" fill="currentColor" stroke="none" />
    <circle cx="21" cy="21" r="1" fill="currentColor" stroke="none" />
    <circle cx="11" cy="25" r="1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="25" r="1" fill="currentColor" stroke="none" />
    <circle cx="21" cy="25" r="1" fill="currentColor" stroke="none" />
  </Glyph>
);

/* Unit Converter: opposing arrows + ruler ticks */
export const ConverterIcon: FC<IconProps> = (p) => (
  <Glyph {...p}>
    <path d="M6 10h17M6 10l3-3M6 10l3 3" />
    <path d="M26 22H9M26 22l-3-3M26 22l-3 3" />
    <line x1="6" y1="16" x2="26" y2="16" opacity="0.5" />
  </Glyph>
);

/* Notes: paper with lines */
export const NotesIcon: FC<IconProps> = (p) => (
  <Glyph {...p}>
    <path d="M22 4H10a3 3 0 0 0-3 3v18a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3z" />
    <line x1="11" y1="11" x2="21" y2="11" />
    <line x1="11" y1="15" x2="21" y2="15" />
    <line x1="11" y1="19" x2="18" y2="19" />
  </Glyph>
);

/* LogicLab: AND-gate silhouette */
export const LogicLabIcon: FC<IconProps> = (p) => (
  <Glyph {...p}>
    <path d="M6 8h7a8 8 0 0 1 0 16H6V8z" />
    <line x1="3" y1="13" x2="6" y2="13" />
    <line x1="3" y1="19" x2="6" y2="19" />
    <line x1="21" y1="16" x2="26" y2="16" />
    <circle cx="27" cy="16" r="1.4" fill="currentColor" stroke="none" />
  </Glyph>
);

/* CircuitSim: zig-zag resistor + grounded node */
export const CircuitSimIcon: FC<IconProps> = (p) => (
  <Glyph {...p}>
    <path d="M5 12h4l1.5-3 3 6 3-6 3 6 1.5-3h4" />
    <line x1="16" y1="18" x2="16" y2="23" />
    <line x1="12" y1="23" x2="20" y2="23" />
    <line x1="13" y1="25" x2="19" y2="25" />
    <line x1="14" y1="27" x2="18" y2="27" />
  </Glyph>
);

/* PhysicsBench: pendulum + mass on the floor */
export const PhysicsIcon: FC<IconProps> = (p) => (
  <Glyph {...p}>
    <line x1="6" y1="5" x2="26" y2="5" />
    <line x1="11" y1="5" x2="11" y2="18" />
    <circle cx="11" cy="20" r="3" />
    <rect x="18" y="22" width="7" height="5" rx="1" />
    <line x1="5" y1="28" x2="27" y2="28" />
  </Glyph>
);

/* AeroSim: airfoil + airflow lines */
export const AeroIcon: FC<IconProps> = (p) => (
  <Glyph {...p}>
    <path d="M5 18c5-1 12-7 22-7 0 4-7 9-22 9z" />
    <path d="M3 11c4 0 8 0 12-1" opacity="0.55" />
    <path d="M3 23c5 1 11 1 16 0" opacity="0.55" />
  </Glyph>
);

/* Modeler3D: isometric cube */
export const ModelerIcon: FC<IconProps> = (p) => (
  <Glyph {...p}>
    <path d="M16 4 4 11v10l12 7 12-7V11L16 4z" />
    <path d="M4 11l12 7 12-7" />
    <line x1="16" y1="18" x2="16" y2="28" />
  </Glyph>
);

/* PartsLib: stacked gears */
export const PartsIcon: FC<IconProps> = (p) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="5" />
    <path d="M12 5v2M12 17v2M5 12h2M17 12h2M7 7l1.4 1.4M15.6 15.6 17 17M7 17l1.4-1.4M15.6 8.4 17 7" />
    <circle cx="22" cy="22" r="4" />
    <path d="M22 17v1.5M22 25.5V27M17 22h1.5M25.5 22H27" />
  </Glyph>
);

/* Conway: 4-cell live block */
export const ConwayIcon: FC<IconProps> = (p) => (
  <Glyph {...p}>
    <rect x="5" y="5" width="6" height="6" rx="1" fill="currentColor" stroke="none" />
    <rect x="13" y="5" width="6" height="6" rx="1" fill="currentColor" stroke="none" opacity="0.5" />
    <rect x="21" y="5" width="6" height="6" rx="1" fill="currentColor" stroke="none" />
    <rect x="5" y="13" width="6" height="6" rx="1" fill="currentColor" stroke="none" opacity="0.5" />
    <rect x="13" y="13" width="6" height="6" rx="1" fill="currentColor" stroke="none" />
    <rect x="21" y="13" width="6" height="6" rx="1" fill="currentColor" stroke="none" opacity="0.5" />
    <rect x="13" y="21" width="6" height="6" rx="1" fill="currentColor" stroke="none" />
    <rect x="21" y="21" width="6" height="6" rx="1" fill="currentColor" stroke="none" />
  </Glyph>
);

/* Sandbox 2D: water wave + rigid body circle + freehand polygon + spring */
export const Sandbox2DIcon: FC<IconProps> = (p) => (
  <Glyph {...p}>
    <circle cx="22" cy="8" r="5" />
    <path d="M5 26 L9 14 L17 18 L14 26 Z" />
    <path d="M4 21 Q7 18 10 21 Q13 24 16 21 Q19 18 22 21" strokeOpacity="0.75" />
    <path d="M20 14 Q21 16 22 14 Q23 12 24 14 Q25 16 26 14" strokeWidth="1.2" />
  </Glyph>
);

/* Settings: a gear */
export const SettingsIcon: FC<IconProps> = (p) => (
  <Glyph {...p}>
    <circle cx="16" cy="16" r="4" />
    <path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.3 6.3l2.8 2.8M22.9 22.9l2.8 2.8M6.3 25.7l2.8-2.8M22.9 9.1l2.8-2.8" />
  </Glyph>
);
