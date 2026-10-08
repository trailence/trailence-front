export enum TrailLoopType {
  ONE_WAY = 'ow',
  LOOP = 'lp',
  HALF_LOOP = 'hl',
  SMALL_LOOP = 'sl',
  OUT_AND_BACK = 'ob',
}

export function getLoopTypeIcon(loopType: TrailLoopType | undefined): string {
  if (loopType === undefined) return 'question';
  switch (loopType) {
    case TrailLoopType.ONE_WAY: return 'one-way';
    case TrailLoopType.LOOP: return 'loop';
    case TrailLoopType.HALF_LOOP: return 'half-loop';
    case TrailLoopType.SMALL_LOOP: return 'small-loop';
    case TrailLoopType.OUT_AND_BACK: return 'out-and-back';
  }
}
