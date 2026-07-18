'use client';

import type { SVGProps } from 'react';

/**
 * Original SF-symbol-inspired icon set drawn from scratch (no Apple assets).
 * All icons inherit `currentColor` and a shared 24x24 grid.
 */
export type IconName =
  | 'library'
  | 'collections'
  | 'heart'
  | 'heart-fill'
  | 'download'
  | 'map'
  | 'video'
  | 'screenshot'
  | 'person-circle'
  | 'people'
  | 'chat'
  | 'trash'
  | 'lock'
  | 'unlock'
  | 'duplicates'
  | 'folder'
  | 'sidebar'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'minus'
  | 'plus'
  | 'aspect'
  | 'filter'
  | 'ellipsis'
  | 'info'
  | 'share'
  | 'search'
  | 'check'
  | 'close'
  | 'compass'
  | 'camera'
  | 'crop'
  | 'adjust'
  | 'filters'
  | 'rotate'
  | 'wand'
  | 'image'
  | 'clock'
  | 'suitcase'
  | 'play'
  | 'pause'
  | 'volume'
  | 'mute'
  | 'expand'
  | 'pip'
  | 'tag'
  | 'document'
  | 'pin'
  | 'mic';

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}

const paths: Record<IconName, JSX.Element> = {
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v3M9 20.5h6" />
    </>
  ),
  library: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M6 3.5h12M4.5 5h15" opacity="0.55" />
      <circle cx="9" cy="11" r="1.6" />
      <path d="M4 17l4.5-4 3 2.5L15 11l5 5.5" />
    </>
  ),
  collections: (
    <>
      <rect x="4" y="7" width="16" height="12" rx="2.5" />
      <path d="M6.5 7V5.5A1.5 1.5 0 0 1 8 4h8a1.5 1.5 0 0 1 1.5 1.5V7" opacity="0.6" />
    </>
  ),
  heart: (
    <path d="M12 20.6 10.6 19.3C5.7 14.9 2.5 12 2.5 8.4 2.5 5.5 4.8 3.2 7.7 3.2c1.6 0 3.2.8 4.3 2.1 1.1-1.3 2.7-2.1 4.3-2.1 2.9 0 5.2 2.3 5.2 5.2 0 3.6-3.2 6.5-8.1 10.9L12 20.6Z" />
  ),
  'heart-fill': (
    <path
      d="M12 20.6 10.6 19.3C5.7 14.9 2.5 12 2.5 8.4 2.5 5.5 4.8 3.2 7.7 3.2c1.6 0 3.2.8 4.3 2.1 1.1-1.3 2.7-2.1 4.3-2.1 2.9 0 5.2 2.3 5.2 5.2 0 3.6-3.2 6.5-8.1 10.9L12 20.6Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  download: (
    <>
      <path d="M12 4v10m0 0 3.5-3.5M12 14l-3.5-3.5" />
      <path d="M5 16v2.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V16" />
    </>
  ),
  map: (
    <>
      <path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2-6-2Z" />
      <path d="M9 4v14M15 6v14" opacity="0.6" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="7" width="13" height="10" rx="2.5" />
      <path d="m16 11 5-3v8l-5-3Z" />
    </>
  ),
  screenshot: (
    <>
      <path d="M4 8V6.5A2.5 2.5 0 0 1 6.5 4H8M16 4h1.5A2.5 2.5 0 0 1 20 6.5V8M20 16v1.5a2.5 2.5 0 0 1-2.5 2.5H16M8 20H6.5A2.5 2.5 0 0 1 4 17.5V16" />
      <rect x="8.5" y="8.5" width="7" height="7" rx="1.5" opacity="0.6" />
    </>
  ),
  document: (
    <>
      <path d="M6 3.5h7L18 8v11.5A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5v-16Z" />
      <path d="M13 3.5V8h5" opacity="0.7" />
      <path d="M9 12.5h6M9 15.5h6M9 9.5h2.5" />
    </>
  ),
  'person-circle': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="10" r="2.6" />
      <path d="M6.8 18a5.4 5.4 0 0 1 10.4 0" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 18a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 6.2A3 3 0 0 1 18 11M16.5 13.4A5.5 5.5 0 0 1 20.5 18" opacity="0.7" />
    </>
  ),
  chat: (
    <>
      <path d="M4 11a5 5 0 0 1 5-5h3a5 5 0 0 1 0 10H9l-4 3v-3.5A5 5 0 0 1 4 11Z" />
      <path d="M9 11h.01M12 11h.01" opacity="0.7" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7" />
      <path d="M6.5 7l.8 11A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.9L17.5 7" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  unlock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 7.5-1.9" />
    </>
  ),
  duplicates: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2.5" />
      <path d="M5 16V6.5A1.5 1.5 0 0 1 6.5 5H16" opacity="0.7" />
    </>
  ),
  folder: (
    <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2.5h8A1.5 1.5 0 0 1 20.5 10v7A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17V7.5Z" />
  ),
  sidebar: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M9.5 5v14" />
    </>
  ),
  'chevron-left': <path d="M14.5 6 9 12l5.5 6" />,
  'chevron-right': <path d="M9.5 6 15 12l-5.5 6" />,
  'chevron-down': <path d="M6 9.5 12 15l6-5.5" />,
  minus: <path d="M6 12h12" />,
  plus: <path d="M12 6v12M6 12h12" />,
  aspect: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="2.5" />
      <path d="M9 6v12" opacity="0.6" />
    </>
  ),
  filter: <path d="M5 7h14M8 12h8M10.5 17h3" />,
  ellipsis: (
    <>
      <circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  share: (
    <>
      <path d="M12 4v11M12 4 8.5 7.5M12 4l3.5 3.5" />
      <path d="M7 11H6a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2h-1" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9 15 2-5 4-2-2 5-4 2Z" fill="currentColor" stroke="none" />
    </>
  ),
  camera: (
    <>
      <path d="M4 9.5A2.5 2.5 0 0 1 6.5 7h1l1-2h7l1 2h1A2.5 2.5 0 0 1 20 9.5V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9.5Z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
  crop: (
    <>
      <path d="M7 3v14h14" />
      <path d="M3 7h14v14" opacity="0.7" />
    </>
  ),
  adjust: (
    <>
      <path d="M5 8h9M18 8h1M5 16h1M10 16h9" />
      <circle cx="16" cy="8" r="2" />
      <circle cx="8" cy="16" r="2" />
    </>
  ),
  filters: (
    <>
      <circle cx="9" cy="10" r="5" />
      <circle cx="15" cy="14" r="5" opacity="0.7" />
    </>
  ),
  rotate: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 1 2.2 5.3" />
      <path d="M4 13.5 4.5 18l4.5-.5" />
    </>
  ),
  wand: (
    <>
      <path d="m6 18 9-9 1.8 1.8-9 9zM15 6l1.2-1.2M19 8l1.4-1.4M17 4l.4-1.4M20.5 11l1.4-.4" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5 17 4.5-4 3 2.5L16 12l4 4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  suitcase: (
    <>
      <rect x="4" y="8" width="16" height="11" rx="2.5" />
      <path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8" />
    </>
  ),
  play: <path d="M8 6.5 18 12 8 17.5Z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="7" y="6" width="3.2" height="12" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.8" y="6" width="3.2" height="12" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5v5h3l4.5 3.5v-12L7 9.5H4Z" fill="currentColor" stroke="none" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9.5v5h3l4.5 3.5v-12L7 9.5H4Z" fill="currentColor" stroke="none" />
      <path d="m15 10 4 4m0-4-4 4" />
    </>
  ),
  expand: (
    <path d="M9 4H5a1 1 0 0 0-1 1v4m11-5h4a1 1 0 0 1 1 1v4M9 20H5a1 1 0 0 1-1-1v-4m11 5h4a1 1 0 0 0 1-1v-4" />
  ),
  pip: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <rect x="12" y="12" width="7" height="5.5" rx="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  tag: (
    <>
      <path d="M4 10.5 11 3.5h7.5V11l-7 7L4 10.5Z" />
      <circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21v-7" />
      <path d="M8 3h8l-1 6 2 2H7l2-2-1-6Z" />
    </>
  ),
};
