/** 时间轴带高度：小节号 + 第二行文案（提示 / 拍范围），避免互相重叠 */
export const PIANO_ROLL_TIMELINE_BAND = 42;
export const PIANO_ROLL_TOP_GAP = 6;
/** 多轨左侧轨道名区域宽度（字号加大后加宽） */
export const PIANO_ROLL_LABEL_GUTTER_MULTI = 112;
export const PIANO_ROLL_LABEL_GUTTER_SINGLE = 52;
/** 底部标题 + 进度时间预留 */
export const PIANO_ROLL_BOTTOM_PAD = 48;
/** 多轨时每条轨道最小高度（画布内容区会按轨数增高，外层再 max-height + 滚动） */
export const PIANO_ROLL_MULTI_MIN_LANE_PX = 58;
/** 单轨默认画布 CSS 高度 */
export const PIANO_ROLL_SINGLE_DEFAULT_HEIGHT_PX = 136;
/**
 * 卷帘可视区域最大高度（Tailwind 任意值，用于外层 overflow-y-auto）
 * 画布实际高度可大于此值，超出部分滚动查看。
 */
export const PIANO_ROLL_VIEWPORT_MAX_CLASS = "max-h-[min(580px,52dvh)]";
