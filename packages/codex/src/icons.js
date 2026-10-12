/**
 * Codex icons — small semantic line symbols that sit next to words:
 * buttons, headings, list rows, lane chips. 24×24, stroked in currentColor,
 * so they take the colour of the text around them and follow the theme.
 *
 *   import { icon } from '@rafime/codex';
 *   button.innerHTML = `${icon('plus')} Add stage`;
 *   icon('settings', { label: 'Settings' })   // standalone icon with a name for screen readers
 *
 * Decorative by default (aria-hidden). Give `label` when the icon stands alone.
 */

/** name → SVG inner markup (paths on a 24×24 grid) */
export const ICONS = {
  // actions
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  edit: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  sync: '<path d="M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  'arrow-left': '<path d="M15 6l-6 6 6 6"/>',
  'arrow-right': '<path d="M9 6l6 6-6 6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  // things
  report: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  note: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  book: '<path d="M4 19.5V5.5A1.5 1.5 0 0 1 5.5 4H20v15H5.5A1.5 1.5 0 0 0 4 20.5 1.5 1.5 0 0 0 5.5 22H20"/><path d="M8 8h8"/>',
  bookmark: '<path d="M7 3h10v18l-5-4-5 4z"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5"/>',
  task: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.1 11 3.5 3.5 0 0 0 7 18z"/>',
  device: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 4L2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  // goals and ways
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  flag: '<path d="M6 21V4M6 4h11l-2 4 2 4H6"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M18 9a5 5 0 0 1-5 5H9a3 3 0 0 0-3 3"/>',
  milestone: '<path d="M12 21V3M12 5h6l2 2.5-2 2.5h-6M12 12H6l-2 2 2 2h6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2.1 4.9-4.9 2.1 2.1-4.9z"/>',
  // life
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/>',
  home: '<path d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14a5 5 0 0 1 5 5"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-14 14z"/><path d="M5 19l8-8"/>',
  // body and mind
  wave: '<path d="M3 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  pill: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-40 12 12)"/><path d="M9.7 9.3l5 4.3"/>',
  cloudrain: '<path d="M7 15h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.1 8 3.5 3.5 0 0 0 7 15z"/><path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2"/>',
  hand: '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.5 0-4-1.2-5.2-3L4 13.6a1.5 1.5 0 0 1 2.4-1.8L8 14"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
  // growing
  drop: '<path d="M12 3.5s6 6.2 6 10.2a6 6 0 0 1-12 0c0-4 6-10.2 6-10.2z"/>',
  flask: '<path d="M9.5 3.2h5M10 3.2v4.3l-3.1 9a2 2 0 0 0 1.9 2.7h6.4a2 2 0 0 0 1.9-2.7l-3.1-9V3.2M7.6 13.2h8.8"/>',
  scissors: '<circle cx="6" cy="17.5" r="2.4"/><circle cx="6" cy="6.5" r="2.4"/><path d="M8 7.8L19 17M8 16.2L19 7"/>',
  camera: '<path d="M3.5 8.8a2 2 0 0 1 2-2h1.6l1.1-2h7.6l1.1 2h1.6a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.2"/>',
  ruler: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7.2 8v3M11 8v4M14.8 8v3M18.6 8v4"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0v4l1.5 3h-15L6 13z"/><path d="M10 19.5a2 2 0 0 0 4 0"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-3.5 2.5-6 7-6 0 3.5-2.5 6-7 6z"/>',
  pot: '<path d="M5 10h14l-2 10H7z"/><path d="M4 10h16M12 10V6M12 6c-2-2-4-2-5-1M12 6c2-2 4-2 5-1"/>',
  tent: '<path d="M3 20L12 4l9 16z"/><path d="M12 4v16M9 20l3-6 3 6"/>',
  flower: '<circle cx="12" cy="9" r="2"/><path d="M12 7a2.5 2.5 0 1 1 0-.1M14 9a2.5 2.5 0 1 1 .1 0M12 11a2.5 2.5 0 1 1 0 .1M10 9a2.5 2.5 0 1 1-.1 0"/><path d="M12 11v10M12 17c-2 0-3.5-1-4-3M12 18c2 0 3.5-1 4-3"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.8"/><path d="M4 17l5-5 4 4 2.5-2.5L20 18"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  share: '<circle cx="18" cy="5.5" r="2.3"/><circle cx="6" cy="12" r="2.3"/><circle cx="18" cy="18.5" r="2.3"/><path d="M8 11l8-4.3M8 13l8 4.3"/>',
  rocket: '<path d="M12 3c3.5 2.2 5 5.8 5 9.5L15 16H9l-2-3.5C7 8.8 8.5 5.2 12 3z"/><circle cx="12" cy="10" r="1.8"/><path d="M9 16l-2.5 3.5M15 16l2.5 3.5M12 17v4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.9-.8 1.9-1.7 0-1.2-1-1.5-1-2.6 0-1 .8-1.7 1.9-1.7h2.2a3.5 3.5 0 0 0 3.5-3.6C20.5 6.8 16.7 3.5 12 3.5z"/><circle cx="7.6" cy="11.5" r="1.1"/><circle cx="10" cy="7.5" r="1.1"/><circle cx="14.6" cy="7.6" r="1.1"/>',
  brush: '<path d="M20 4l-8.6 9.4M11.4 13.4l-2-2M9.4 11.4c-2.4-.3-4.2 1.2-4.4 3.6-.1 1.8-.8 2.9-2 3.5 3.5 1.5 7.6.5 8.3-2.9.2-1 .1-1.8-.3-2.2z"/>',
  swatch: '<rect x="4" y="3.5" width="7" height="17" rx="1.5"/><path d="M11 8.2l4.9-2.9 3.5 6-8.4 5M11 20.5h8.5v-7H15"/><circle cx="7.5" cy="16.5" r=".9"/>',
};

/** Names of all icons. */
export const ICON_NAMES = Object.keys(ICONS);

const escAttr = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * An icon as an SVG string. Unknown names give an empty string (and a
 * console warning in development), never broken markup.
 */
export function icon(name, { label, className = '', size } = {}) {
  const body = ICONS[name];
  if (!body) {
    if (typeof console !== 'undefined') console.warn(`codex: unknown icon "${name}"`);
    return '';
  }
  const a11y = label ? `role="img" aria-label="${escAttr(label)}"` : 'aria-hidden="true" focusable="false"';
  const cls = `cx-icon cx-icon--${name}${label ? ' cx-icon--only' : ''}${className ? ` ${escAttr(className)}` : ''}`;
  const dim = size ? ` width="${Number(size)}" height="${Number(size)}"` : '';
  return `<svg class="${cls}" viewBox="0 0 24 24"${dim} ${a11y}>${body}</svg>`;
}

/** Icon followed by text, for buttons and headings: `${withIcon('plus', 'Add')}` (text is escaped). */
export function withIcon(name, text) {
  return `${icon(name)}<span>${escAttr(text)}</span>`;
}

/**
 * Static pages: replace every `<i data-icon="name"></i>` placeholder with the
 * icon. Keep the placeholder next to the text (not on a translated element),
 * e.g. `<h3><i data-icon="target"></i><span data-i18n="…">Goals</span></h3>`.
 */
export function applyIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach((el) => {
    const svg = icon(el.getAttribute('data-icon'));
    if (svg) el.outerHTML = svg;
  });
}
