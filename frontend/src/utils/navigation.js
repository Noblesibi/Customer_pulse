/**
 * Navigates back to the exact page the user clicked from without creating
 * forward-push back-loops in React Router history.
 *
 * Priority:
 *  1. If React Router has a previous in-app history entry (history.state.idx > 0),
 *     use navigate(-1) so the exact originating route, query params, and state are restored.
 *  2. Otherwise, if location.state.from was explicitly supplied, navigate there with replace: true.
 *  3. Otherwise, fall back to fallbackPath with replace: true.
 */
export function goBackToOrigin(navigate, location, fallbackPath = '/dashboard') {
  const hasInAppHistory =
    typeof window !== 'undefined' &&
    typeof window.history?.state?.idx === 'number' &&
    window.history.state.idx > 0;

  if (hasInAppHistory) {
    navigate(-1);
    return;
  }

  const rawFrom = location?.state?.from;
  if (rawFrom && typeof rawFrom === 'string') {
    const from = rawFrom.startsWith('/CustomerPulse')
      ? rawFrom.replace(/^\/CustomerPulse/, '') || '/'
      : rawFrom;
    const tab = location.state?.tab || location.state?.fromTab;
    navigate(from, {
      replace: true,
      ...(tab ? { state: { tab } } : {}),
    });
    return;
  }

  navigate(fallbackPath, { replace: true });
}
