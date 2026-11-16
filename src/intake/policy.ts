export function canContinueSafety(safety: 'clear' | 'urgent' | 'uncertain' | null, acknowledged: boolean) {
  return safety === 'clear' || ((safety === 'urgent' || safety === 'uncertain') && acknowledged);
}
