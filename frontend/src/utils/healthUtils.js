/**
 * Unified CustomerPulse Health Score & Status standard
 * 
 * Official 3-tier traffic-light standard:
 * - 70 to 100: Green · Healthy (Strong engagement, good coverage, on-track commitments)
 * - 40 to 69:  Amber · Warning (Needs attention, moderate engagement or pending items)
 * - 0 to 39:   Red · Critical   (Elevated risk, severe delays or lack of touchpoints)
 */
export const getAccountHealthConfig = (score) => {
  const s = typeof score === 'number' ? score : (parseInt(score, 10) || 0);

  if (s >= 70) {
    return {
      status: 'Healthy',
      colorName: 'Green',
      badgeText: 'Green · Healthy',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      pillClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dotClass: 'bg-emerald-500',
      textClass: 'text-emerald-600',
      hex: '#10B981'
    };
  }

  if (s >= 40) {
    return {
      status: 'Warning',
      colorName: 'Amber',
      badgeText: 'Amber · Warning',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
      pillClass: 'bg-amber-50 text-amber-700 border-amber-200',
      dotClass: 'bg-amber-500',
      textClass: 'text-amber-600',
      hex: '#F59E0B'
    };
  }

  return {
    status: 'Critical',
    colorName: 'Red',
    badgeText: 'Red · Critical',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
    pillClass: 'bg-rose-50 text-rose-700 border-rose-200',
    dotClass: 'bg-rose-500',
    textClass: 'text-rose-600',
    hex: '#EF4444'
  };
};

