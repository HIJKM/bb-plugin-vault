export const COARSE_POINTER_TEXT_BASE_CLASS =
  "text-sm in-data-[phone-metrics]:text-base";

export const COARSE_POINTER_TEXT_SM_CLASS =
  "text-xs in-data-[phone-metrics]:text-sm";

export const COARSE_POINTER_ICON_SIZE_CLASS =
  "size-4 in-data-[phone-metrics]:size-5";

export const COARSE_POINTER_ICON_SIZE_SHRINK_CLASS =
  "size-4 shrink-0 in-data-[phone-metrics]:size-5";

export const COARSE_POINTER_COMPACT_ICON_SIZE_CLASS =
  "size-3.5 in-data-[phone-metrics]:size-5";

export const COARSE_POINTER_COMPACT_ICON_SIZE_SHRINK_CLASS =
  "size-3.5 shrink-0 in-data-[phone-metrics]:size-5";

export const COARSE_POINTER_DOT_SIZE_CLASS =
  "size-1.5 in-data-[phone-metrics]:size-2";

export const COARSE_POINTER_GLYPH_BOX_CLASS =
  "h-4 w-4 in-data-[phone-metrics]:h-5 in-data-[phone-metrics]:w-5";

export const COARSE_POINTER_CHECK_SLOT_CLASS =
  "h-3.5 w-3.5 in-data-[phone-metrics]:h-5 in-data-[phone-metrics]:w-5";

// Shared box geometry (and thus the pointer/focus hit target) for header icon
// buttons. The glyph size is layered on separately so a reduced-glyph variant
// can shrink the artwork without touching the button footprint.
const HEADER_ICON_BUTTON_BOX_CLASS =
  "h-[28px] w-[28px] rounded-md p-0 in-data-[phone-metrics]:h-[36px] in-data-[phone-metrics]:w-[36px]";

export const COARSE_POINTER_HEADER_ICON_BUTTON_CLASS = `${HEADER_ICON_BUTTON_BOX_CLASS} [&_svg]:size-[16px] in-data-[phone-metrics]:[&_svg]:size-[20px]`;

// Same button box as above, but paints the glyph one optical step smaller.
// Some glyphs (e.g. the maximize/restore double-arrows, which cover ~66% of the
// 24px icon grid) read visibly larger than the compact controls they sit beside
// (the close X covers ~32%) at the shared 16px size. Rendering them at 13px fine
// / 16px coarse (~0.81x) matches their painted footprint to the sibling
// controls while keeping the 28/36px hit target identical. Other surfaces
// already reduce these same glyphs (prompt box 12px, panel collapse 14px).
export const COARSE_POINTER_HEADER_REDUCED_GLYPH_ICON_BUTTON_CLASS = `${HEADER_ICON_BUTTON_BOX_CLASS} [&_svg]:size-[13px] in-data-[phone-metrics]:[&_svg]:size-[16px]`;

export const COARSE_POINTER_COMPACT_ICON_BUTTON_CLASS =
  "h-7 w-7 rounded-md p-0 [&_svg]:size-3.5 in-data-[phone-metrics]:h-9 in-data-[phone-metrics]:w-9 in-data-[phone-metrics]:[&_svg]:size-5";

export const COARSE_POINTER_CHILD_ICON_BUTTON_CLASS =
  "h-8 w-8 justify-center p-0 [&>svg]:size-4 in-data-[phone-metrics]:h-9 in-data-[phone-metrics]:w-9 in-data-[phone-metrics]:[&>svg]:size-5";

export const COARSE_POINTER_TOOLBAR_ACTION_BUTTON_CLASS =
  "h-7 rounded-md border-border bg-transparent px-2 text-xs font-medium text-foreground shadow-none hover:bg-state-hover hover:text-foreground in-data-[phone-metrics]:h-9";

export const COARSE_POINTER_PROMPT_ACTION_BUTTON_CLASS =
  "h-8 px-2 transition-all in-data-[phone-metrics]:h-10 in-data-[phone-metrics]:px-2.5";

export const COARSE_POINTER_PROMPT_ICON_ACTION_BUTTON_CLASS =
  "size-auto h-8 px-2 transition-all in-data-[phone-metrics]:h-10 in-data-[phone-metrics]:px-2.5";

export const COARSE_POINTER_PROMPT_COMBO_BUTTON_CLASS =
  "h-8 w-8 rounded-l-none border-l border-l-primary-foreground/20 px-0 transition-all hover:border-l-primary-foreground/30 in-data-[phone-metrics]:h-10 in-data-[phone-metrics]:w-10";

export const COARSE_POINTER_INPUT_HEIGHT_CLASS =
  "h-9 in-data-[phone-metrics]:h-10";

export const COARSE_POINTER_COMPACT_ROW_HEIGHT_CLASS =
  "h-7 in-data-[phone-metrics]:h-9";

export const COARSE_POINTER_ROW_HEIGHT_CLASS =
  "h-[var(--bb-sidebar-row-height)] in-data-[phone-metrics]:h-[var(--bb-sidebar-row-height-coarse)]";

export const COARSE_POINTER_PROVIDER_TAB_SIZE_CLASS =
  "h-7 w-6 in-data-[phone-metrics]:h-9 in-data-[phone-metrics]:w-9";

export const COARSE_POINTER_ROW_ACTION_SIZE_CLASS =
  "h-7 w-7 in-data-[phone-metrics]:h-9 in-data-[phone-metrics]:w-9";

// Reader type. Desktop sizes stay on the class. The in-data-[phone-metrics]
// half applies only when an ancestor has data-phone-metrics, which the reader
// sets for a narrow phone. A narrow desktop window keeps the small size.
export const COARSE_POINTER_TREE_ROW_SIZE_CLASS =
  "h-6 text-[13px] in-data-[phone-metrics]:h-[1.875rem] in-data-[phone-metrics]:text-sm";

// Codes phone chrome. The phone half is in-data-[phone-metrics]:
// file header is 2.5rem with 0.8125rem type, and its buttons are 2rem.
export const COARSE_POINTER_HEADER_BAR_CLASS =
  "h-9 in-data-[phone-metrics]:h-10";

export const COARSE_POINTER_HEADER_TITLE_CLASS =
  "text-sm in-data-[phone-metrics]:text-[0.8125rem]";

export const COARSE_POINTER_TREE_ICON_CLASS =
  "size-3.5 shrink-0 in-data-[phone-metrics]:size-4";

// The host markdown root sets text-sm. important wins over that host rule
// only under data-phone-metrics, so a desktop window stays at text-sm.
export const COARSE_POINTER_MARKDOWN_BODY_CLASS = [
  "in-data-[phone-metrics]:[&_[data-markdown-preview]]:text-base!",
  "in-data-[phone-metrics]:[&_[data-markdown-preview]_h1]:text-lg!",
  "in-data-[phone-metrics]:[&_[data-markdown-preview]_h2]:text-lg!",
  "in-data-[phone-metrics]:[&_[data-markdown-preview]_h3]:text-base!",
  "in-data-[phone-metrics]:[&_[data-markdown-preview]_h4]:text-base!",
  "in-data-[phone-metrics]:[&_[data-markdown-preview]_h5]:text-base!",
  "in-data-[phone-metrics]:[&_[data-markdown-preview]_h6]:text-sm!",
  "in-data-[phone-metrics]:[&_[data-markdown-preview]_code]:text-sm!",
].join(" ");

export const COARSE_POINTER_ICON_BUTTON_GROW_CLASS =
  "in-data-[phone-metrics]:size-8 in-data-[phone-metrics]:[&_svg]:size-4";

export const COARSE_POINTER_META_TEXT_CLASS =
  "text-[11px] in-data-[phone-metrics]:text-sm";
