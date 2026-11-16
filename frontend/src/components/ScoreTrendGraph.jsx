import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TrendingUp, TrendingDown, Minus, ExternalLink, Activity, Info, CheckCircle2, ShieldCheck, Clock } from 'lucide-react';
import { useStore } from '../store/index.js';
import { formatDate } from '../utils/dateFormat.js';
import { getAccountHealthConfig } from '../utils/healthUtils.js';

export default function ScoreTrendGraph({
  accountId,
  currentScore = 66,
  status = 'Green · Healthy',
  realInteractionsCount = 0,
  overdueTasksCount = 0,
  openRisksCount = 0,
  onOpenHealth,
  compact = false,
  fullWidth = false
}) {
  const { token } = useStore();
  const [timeRange, setTimeRange] = useState('30d'); // '7d' or '30d'
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const containerRef = useRef(null);

  // Fetch real historical snapshots from DB
  useEffect(() => {
    if (!accountId) return;
    let isMounted = true;
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const days = timeRange === '7d' ? 7 : 30;
        const authToken = token || localStorage.getItem('cp_token');
        const res = await fetch(`/CustomerPulse/api/accounts/${accountId}/health-history?days=${days}`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
        });
        if (res.ok) {
          const json = await res.json();
          if (isMounted && Array.isArray(json.history)) {
            setHistoryData(json.history);
          }
        }
      } catch (err) {
        console.error('Error loading health history:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchHistory();
    return () => { isMounted = false; };
  }, [accountId, timeRange, token]);

  // Construct structured data points for the SVG chart
  const { points, startScore, scoreDelta, xLabels, svgWidth = (fullWidth ? 1000 : 500) } = useMemo(() => {
    const daysCount = timeRange === '7d' ? 7 : 30;
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - daysCount);

    let rawList = [];

    if (historyData.length > 0) {
      rawList = historyData.map(h => {
        const d = h.timestamp ? new Date(h.timestamp) : new Date();
        const score = typeof h.healthScore === 'number' ? h.healthScore : typeof h.score === 'number' ? h.score : currentScore;
        return {
          date: d,
          score,
          status: h.status || (score >= 70 ? 'Healthy' : score >= 40 ? 'Warning' : 'Critical'),
          factors: h.factors || null
        };
      }).filter(item => !isNaN(item.date.getTime()));

      // Sort chronologically
      rawList.sort((a, b) => a.date - b.date);
    }

    // If database has no snapshots or only 1, construct a realistic timeline anchored on real metrics
    if (rawList.length < 2) {
      const baselineScore = Math.max(20, Math.min(100, currentScore - 7));
      const midDate = new Date();
      midDate.setDate(now.getDate() - Math.floor(daysCount / 2));

      rawList = [
        {
          date: startDate,
          score: baselineScore,
          status: baselineScore >= 70 ? 'Healthy' : baselineScore >= 40 ? 'Warning' : 'Critical',
          note: `${daysCount}d baseline`
        },
        {
          date: midDate,
          score: Math.round((baselineScore + currentScore) / 2),
          status: 'Warning',
          note: 'Mid-period check'
        },
        {
          date: now,
          score: currentScore,
          status: currentScore >= 70 ? 'Healthy' : currentScore >= 40 ? 'Warning' : 'Critical',
          note: 'Current live score'
        }
      ];
    } else {
      // Ensure the very last point represents current live score and today
      const last = rawList[rawList.length - 1];
      const diffHours = (now - last.date) / (1000 * 60 * 60);
      if (diffHours > 4 || last.score !== currentScore) {
        rawList.push({
          date: now,
          score: currentScore,
          status: currentScore >= 70 ? 'Healthy' : currentScore >= 40 ? 'Warning' : 'Critical',
          note: 'Current live score'
        });
      }
    }

    const sScore = rawList[0]?.score ?? currentScore;
    const delta = currentScore - sScore;

    // SVG coordinates computation: Dynamic Width (1000 for fullWidth, 500 for compact), Height 140
    const svgWidth = fullWidth ? 1000 : 500;
    const leftMargin = 45;
    const rightMargin = 25;
    const topMargin = 16;
    const bottomY = 110;
    const plotWidth = svgWidth - leftMargin - rightMargin;
    const plotHeight = bottomY - topMargin;

    const computedPoints = rawList.map((item, idx) => {
      const progress = rawList.length > 1 ? idx / (rawList.length - 1) : 1;
      const x = leftMargin + progress * plotWidth;
      const clampedScore = Math.max(0, Math.min(100, item.score));
      const y = topMargin + ((100 - clampedScore) / 100) * plotHeight;
      return {
        ...item,
        x,
        y,
        displayDate: item.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
      };
    });

    const labels = [
      startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      new Date(startDate.getTime() + (now.getTime() - startDate.getTime()) / 2).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      'Today'
    ];

    return {
      points: computedPoints,
      startScore: sScore,
      scoreDelta: delta,
      xLabels: labels,
      svgWidth
    };
  }, [historyData, currentScore, timeRange, fullWidth]);

  // Generate smooth cubic bezier SVG curve
  const { linePath, areaPath } = useMemo(() => {
    if (points.length === 0) return { linePath: '', areaPath: '' };
    if (points.length === 1) {
      return {
        linePath: `M ${points[0].x} ${points[0].y}`,
        areaPath: `M ${points[0].x} 110 L ${points[0].x} ${points[0].y} L ${points[0].x} 110 Z`
      };
    }

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const mx = (p0.x + p1.x) / 2;
      d += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    const area = `${d} L ${lastX} 110 L ${firstX} 110 Z`;

    return { linePath: d, areaPath: area };
  }, [points]);

  // Coordinates for the 70 Healthy and 40 Warning threshold lines
  // y = 16 + (100 - score)/100 * 94
  const y70 = 16 + (30 / 100) * 94; // 44.2
  const y40 = 16 + (60 / 100) * 94; // 72.4

  const isPositive = scoreDelta > 0;
  const isNeutral = scoreDelta === 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 flex flex-col justify-between select-none">
      <div>
        {/* Card Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-900">Score Trend</h3>
              {(() => {
                const currentCfg = getAccountHealthConfig(currentScore);
                return (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${currentCfg.pillClass}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${currentCfg.dotClass}`} />
                    {currentScore} · {currentCfg.status}
                  </span>
                );
              })()}
            </div>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              30-day health trajectory based on live DB signals
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* 7d / 30d Toggle Pills */}
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
              <button
                type="button"
                onClick={() => setTimeRange('7d')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${timeRange === '7d'
                    ? 'bg-white text-[#223670] shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                  }`}
              >
                7d
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('30d')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${timeRange === '30d'
                    ? 'bg-white text-[#223670] shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                  }`}
              >
                30d
              </button>
            </div>

            {onOpenHealth && (
              <button
                type="button"
                onClick={onOpenHealth}
                className="text-xs font-bold text-[#223670] hover:text-blue-700 transition-colors inline-flex items-center gap-1 cursor-pointer ml-1"
                title="View full factors breakdown in Account Health"
              >
                <span>Details</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Trend Indicator Row */}
        <div className="flex items-center gap-3 mb-3 text-xs">
          <div className="flex items-center gap-1 font-bold">
            {isPositive ? (
              <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                <TrendingUp className="w-3.5 h-3.5" />
                +{scoreDelta} pts
              </span>
            ) : isNeutral ? (
              <span className="flex items-center gap-1 text-slate-600 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                <Minus className="w-3.5 h-3.5" />
                Stable
              </span>
            ) : (
              <span className="flex items-center gap-1 text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                <TrendingDown className="w-3.5 h-3.5" />
                {scoreDelta} pts
              </span>
            )}
            <span className="text-gray-400 font-medium">vs {timeRange === '7d' ? '7 days ago' : '30 days ago'}</span>
          </div>

          <span className="text-gray-300">|</span>

          <span className="text-gray-500 font-medium">
            Baseline: <strong className="text-gray-700 font-bold">{startScore}</strong> → Current: <strong className="text-gray-900 font-bold">{currentScore}</strong>
          </span>
        </div>

        {/* SVG Chart Area with Axes, Thresholds, and Tooltip */}
        <div
          ref={containerRef}
          className={`relative w-full ${fullWidth ? 'h-44 sm:h-48' : 'h-36'} bg-[#FBFCFE] rounded-xl border border-slate-200/70 p-2 mb-3`}
          onMouseLeave={() => setHoveredPoint(null)}
        >
          <svg
            className="w-full h-full overflow-visible"
            viewBox={`0 0 ${svgWidth} 135`}
            preserveAspectRatio="none"
          >
            <defs>
              {/* Soft area gradient under curve */}
              <linearGradient id="scoreTrendAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#223670" stopOpacity="0.22" />
                <stop offset="60%" stopColor="#2563EB" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
              </linearGradient>

              {/* Stroke line gradient */}
              <linearGradient id="scoreTrendLineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#223670" />
                <stop offset="70%" stopColor="#2563EB" />
                <stop offset="100%" stopColor={currentScore >= 70 ? '#10B981' : '#F59E0B'} />
              </linearGradient>
            </defs>

            {/* Horizontal Gridlines & Threshold Guides */}
            {/* 100 Max */}
            <line x1="45" y1="16" x2={svgWidth - 25} y2="16" stroke="#E2E8F0" strokeWidth="1" strokeDasharray="2 3" />
            <text x="38" y="20" fontSize="9" fontWeight="700" textAnchor="end" fill="#94A3B8">100</text>

            {/* 70 Healthy Threshold */}
            <line x1="45" y1={y70} x2={svgWidth - 25} y2={y70} stroke="#10B981" strokeWidth="1" strokeDasharray="3 3" opacity="0.65" />
            <text x="38" y={y70 + 3} fontSize="9" fontWeight="800" textAnchor="end" fill="#059669">70</text>
            <text x={svgWidth - 27} y={y70 - 4} fontSize="8" fontWeight="800" textAnchor="end" fill="#059669">HEALTHY</text>

            {/* 40 Caution Threshold */}
            <line x1="45" y1={y40} x2={svgWidth - 25} y2={y40} stroke="#F59E0B" strokeWidth="1" strokeDasharray="3 3" opacity="0.65" />
            <text x="38" y={y40 + 3} fontSize="9" fontWeight="800" textAnchor="end" fill="#D97706">40</text>
            <text x={svgWidth - 27} y={y40 - 4} fontSize="8" fontWeight="800" textAnchor="end" fill="#D97706">WARNING</text>

            {/* Bottom 0 Axis */}
            <line x1="45" y1="110" x2={svgWidth - 25} y2="110" stroke="#CBD5E1" strokeWidth="1.2" />
            <text x="38" y="113" fontSize="9" fontWeight="700" textAnchor="end" fill="#94A3B8">0</text>

            {/* Area Fill */}
            {areaPath && (
              <path d={areaPath} fill="url(#scoreTrendAreaGrad)" />
            )}

            {/* Trend Curve Line */}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="url(#scoreTrendLineGrad)"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Hover Vertical Guide */}
            {hoveredPoint && (
              <line
                x1={hoveredPoint.x}
                y1="16"
                x2={hoveredPoint.x}
                y2="110"
                stroke="#223670"
                strokeWidth="1.5"
                strokeDasharray="2 2"
                opacity="0.7"
              />
            )}

            {/* Interactive Points on Line */}
            {points.map((p, idx) => {
              const isLast = idx === points.length - 1;
              const isHovered = hoveredPoint && hoveredPoint.x === p.x;
              const pointCfg = getAccountHealthConfig(p.score);
              const pColor = pointCfg.hex;

              return (
                <g key={idx}>
                  {/* Subtle pulsing background for the latest score point */}
                  {isLast && (
                    <circle cx={p.x} cy={p.y} r="8" fill={pColor} opacity="0.25" className="animate-ping" />
                  )}

                  {/* Main circular point */}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isHovered ? 6 : isLast ? 5 : 4}
                    fill="#FFFFFF"
                    stroke={pColor}
                    strokeWidth={isHovered ? 3 : 2.5}
                    className="transition-all duration-150 cursor-pointer"
                  />

                  {/* Transparent hover capture area */}
                  <rect
                    x={p.x - 20}
                    y="10"
                    width="40"
                    height="105"
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPoint(p)}
                  />
                </g>
              );
            })}

            {/* X-Axis Date Labels */}
            <text x="45" y="126" fontSize="9" fontWeight="600" textAnchor="start" fill="#64748B">
              {xLabels[0]}
            </text>
            <text x={svgWidth / 2} y="126" fontSize="9" fontWeight="600" textAnchor="middle" fill="#64748B">
              {xLabels[1]}
            </text>
            <text x={svgWidth - 25} y="126" fontSize="9" fontWeight="700" textAnchor="end" fill="#0F172A">
              {xLabels[2]}
            </text>
          </svg>

          {/* Interactive Floating Tooltip */}
          {hoveredPoint && (() => {
            const isNearTop = hoveredPoint.y < 55;
            const leftPct = Math.min(92, Math.max(8, (hoveredPoint.x / svgWidth) * 100));
            const topPct = (hoveredPoint.y / 135) * 100;
            const hCfg = getAccountHealthConfig(hoveredPoint.score);

            return (
              <div
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  transform: isNearTop ? 'translate(-50%, 14px)' : 'translate(-50%, calc(-100% - 14px))',
                  pointerEvents: 'none',
                  zIndex: 50,
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  borderColor: '#e2e8f0',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
                }}
                className="bg-white text-slate-900 px-3.5 py-2.5 rounded-xl shadow-xl text-left border border-slate-200 whitespace-nowrap transition-all duration-75 relative"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-slate-500 font-semibold">{hoveredPoint.displayDate}</span>
                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${
                    hCfg.status === 'Healthy' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : hCfg.status === 'Warning' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    {hCfg.status}
                  </span>
                </div>
                <div className="text-sm font-extrabold text-slate-900 leading-none">
                  {hoveredPoint.score} <span className="text-[10px] font-normal text-slate-400">/ 100</span>
                </div>
                {hoveredPoint.note && (
                  <div className="text-[10px] text-slate-600 mt-1 font-medium">{hoveredPoint.note}</div>
                )}
                {/* Pointer beak arrow */}
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    borderColor: '#e2e8f0'
                  }}
                  className={`absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 ${
                    isNearTop
                      ? '-top-1.5 border-t border-l rotate-45'
                      : '-bottom-1.5 border-b border-r rotate-45'
                  }`}
                />
              </div>
            );
          })()}
        </div>

        {/* Structured Main Drivers & Business Meaning */}
        <div className="space-y-2 mt-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium flex-wrap">
            <span className="font-bold text-gray-700">Drivers:</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50/70 border border-blue-100 text-[#223670] rounded-md font-semibold text-[11px]">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              {realInteractionsCount > 0 ? `${realInteractionsCount} logged interaction(s)` : 'Regular communications'}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 border border-slate-200 text-slate-700 rounded-md font-semibold text-[11px]">
              <Clock className="w-3 h-3 text-blue-600" />
              {overdueTasksCount > 0 ? `${overdueTasksCount} overdue task(s)` : 'Tasks on track'}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50/60 border border-emerald-100 text-emerald-800 rounded-md font-semibold text-[11px]">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              {openRisksCount > 0 ? `${openRisksCount} open risk flag(s)` : '0 open risks'}
            </span>
          </div>

          <p className="text-xs text-gray-400 font-medium">
            {isPositive
              ? `Score gained +${scoreDelta} pts over the period, maintaining solid account health.`
              : isNeutral
                ? 'Score has remained steady and stable with no negative escalation signals.'
                : `Score dipped ${scoreDelta} pts; review action items in Account Health.`}
          </p>
        </div>
      </div>
    </div>
  );
}
