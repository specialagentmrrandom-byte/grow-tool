export type IconName = 'plus' | 'check' | 'close' | 'edit' | 'trash' | 'download' | 'upload' | 'copy' | 'settings' | 'sync' | 'eye' | 'arrow-left' | 'arrow-right' | 'undo' | 'report' | 'note' | 'book' | 'bookmark' | 'calendar' | 'clock' | 'wheel' | 'task' | 'star' | 'lock' | 'shield' | 'cloud' | 'device' | 'globe' | 'info' | 'alert' | 'sun' | 'moon' | 'target' | 'flag' | 'route' | 'branch' | 'milestone' | 'compass' | 'heart' | 'briefcase' | 'home' | 'people' | 'bulb' | 'sparkle' | 'leaf' | 'wave' | 'smile' | 'bolt' | 'pill' | 'cloudrain' | 'hand' | 'phone' | 'drop' | 'flask' | 'scissors' | 'camera' | 'ruler' | 'bell' | 'sprout' | 'pot' | 'tent' | 'flower' | 'image' | 'play' | 'pause' | 'share' | 'rocket' | 'search' | 'grid' | 'help' | 'palette' | 'brush' | 'swatch';
export interface IconOptions {
  /** name for screen readers; without it the icon is decorative (aria-hidden) */
  label?: string;
  className?: string;
  /** width/height in px; default 1.15em via CSS */
  size?: number;
}
export declare const ICONS: Readonly<Record<IconName, string>>;
export declare const ICON_NAMES: readonly IconName[];
export declare function icon(name: IconName, options?: IconOptions): string;
export declare function withIcon(name: IconName, text: string): string;
export declare function applyIcons(root?: ParentNode): void;
