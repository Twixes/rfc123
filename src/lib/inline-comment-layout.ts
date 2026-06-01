/**
 * Pure layout helpers shared by the read-mode and edit-mode inline comment
 * sidebars. Kept free of React + DOM so they're trivial to test and the same
 * cascading / arrow-routing rules apply identically across both modes.
 */

const STACK_GAP = 8;

export interface CascadeBox {
  /** Stable key the caller uses to read back the resolved position. Read mode
   *  uses -1 for the active draft and the 1-based line number for everything
   *  else; edit mode uses original-file line numbers. */
  key: number;
  /** Determines stacking order — boxes are cascaded top-to-bottom by this. */
  sortLine: number;
  /** Pre-cascade Y offset (where the box would sit if it had no neighbors). */
  baseOffset: number;
  /** Already-measured height of the box. */
  boxHeight: number;
}

export interface CascadeResult {
  /** Resolved Y for each input key, after the push-down. */
  positions: Map<number, number>;
  /** Bottom edge of the lowest box — caller sets the column's min-height to
   *  this so the cascade never overflows below the rendered content. */
  maxBottom: number;
}

/**
 * Walks the boxes top-to-bottom, pushing each one down to clear the previous
 * box plus an 8px gap. The order is determined by `sortLine`, not the key.
 */
export function cascadeBoxes(boxes: readonly CascadeBox[]): CascadeResult {
  const sorted = [...boxes].sort((a, b) => a.sortLine - b.sortLine);
  const positions = new Map<number, number>();
  let lastBottom = 0;
  let maxBottom = 0;
  for (const box of sorted) {
    const adjusted = Math.max(box.baseOffset, lastBottom);
    positions.set(box.key, adjusted);
    maxBottom = Math.max(maxBottom, adjusted + box.boxHeight);
    lastBottom = adjusted + box.boxHeight + STACK_GAP;
  }
  return { positions, maxBottom };
}

const ELBOW_OFFSET = 4;

export interface ArrowInput {
  /** Used for both React key and the `data-arrow-line` attribute. */
  lineNumber: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  isDraft: boolean;
}

export interface ArrowPath extends ArrowInput {
  /** X coordinate of the arrow's vertical segment (the "elbow"). */
  elbowX: number;
}

/**
 * Routes each arrow with an elbow that doesn't visually overlap another
 * elbow occupying the same vertical range. Arrows are processed in order of
 * their top Y, and each one tries the average elbow X first, then steps left
 * by 4px increments until it clears all previously placed segments.
 */
export function layoutArrows(arrows: readonly ArrowInput[]): ArrowPath[] {
  if (arrows.length === 0) return [];

  const baseElbowX =
    arrows.reduce((sum, a) => sum + (a.from.x + a.to.x) / 2, 0) / arrows.length;

  const sorted = [...arrows]
    .map((a) => ({
      arrow: a,
      vy1: Math.min(a.from.y, a.to.y),
      vy2: Math.max(a.from.y, a.to.y),
    }))
    .sort((a, b) => a.vy1 - b.vy1);

  const segments: Array<{ x: number; vy1: number; vy2: number }> = [];
  const out: ArrowPath[] = [];

  for (const { arrow, vy1, vy2 } of sorted) {
    let offset = 0;
    let elbowX = Math.max(arrow.to.x, baseElbowX);
    while (true) {
      const tryX = Math.max(arrow.to.x, baseElbowX - offset);
      const overlaps = segments.some(
        (s) =>
          Math.abs(s.x - tryX) < ELBOW_OFFSET &&
          Math.min(vy2, s.vy2) > Math.max(vy1, s.vy1),
      );
      if (!overlaps) {
        elbowX = tryX;
        break;
      }
      // We've been pushed all the way to the target X; nothing further to try.
      // Accept the overlap rather than loop forever.
      if (tryX === arrow.to.x) {
        elbowX = tryX;
        break;
      }
      offset += ELBOW_OFFSET;
    }
    segments.push({ x: elbowX, vy1, vy2 });
    out.push({
      lineNumber: arrow.lineNumber,
      from: arrow.from,
      to: arrow.to,
      color: arrow.color,
      isDraft: arrow.isDraft,
      elbowX,
    });
  }

  return out;
}
