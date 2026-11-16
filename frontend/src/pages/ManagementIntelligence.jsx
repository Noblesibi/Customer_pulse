import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Activity, Map, AlertTriangle, TrendingUp, ChevronRight, CheckSquare, X } from 'lucide-react';
import { useStore } from '../store/index.js';

export default function ManagementIntelligence({ data, drillDown, setDrillDown }) {
  const navigate = useNavigate();

  if (!data) return null;

  return (
    <div className="w-full space-y-6 relative h-full">

      <div className="grid grid-cols-1 gap-6">

        {/* TOP RECOMMENDED ACTIONS */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #e8edf5', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: 440 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexShrink: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7' }}>
              <CheckSquare size={18} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>Top Recommended Actions</h2>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 10 }} className="custom-scrollbar">
            {data.topActions.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.5 }}>
                <CheckSquare size={32} color="#94a3b8" style={{ marginBottom: 12 }} />
                <p style={{ fontSize: 14, fontWeight: 700, color: '#64748b' }}>No pending recommendations.</p>
              </div>
            ) : (
              data.topActions.map((nba, idx) => {
                const isHigh = nba.priority === 'High';
                const isMed = nba.priority === 'Medium';
                const badgeBg = isHigh ? '#fef2f2' : isMed ? '#fffbeb' : '#eff6ff';
                const badgeColor = isHigh ? '#ef4444' : isMed ? '#f59e0b' : '#3b82f6';
                
                return (
                  <div 
                    key={idx} 
                    onClick={() => navigate(`/accounts/${nba.accountId}`)}
                    style={{ 
                      padding: 16, borderRadius: 16, border: '1px solid #f1f5f9', background: '#ffffff',
                      cursor: 'pointer', transition: 'all 0.2s ease', position: 'relative'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.querySelector('.chevron').style.transform = 'translateX(4px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#f1f5f9'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.querySelector('.chevron').style.transform = 'translateX(0)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 6, background: badgeBg, color: badgeColor }}>
                          {nba.priority}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#475569' }}>{nba.companyName}</span>
                      </div>
                      <ChevronRight className="chevron" size={16} color="#94a3b8" style={{ transition: 'transform 0.2s ease' }} />
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', lineHeight: 1.4, margin: 0 }}>
                      {nba.suggestedAction}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Drill-down Modal (Using Light theme as requested previously for Modals) */}
      {drillDown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setDrillDown(null)}>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-xl font-black text-gray-900">{drillDown.title}</h2>
              <button onClick={() => setDrillDown(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3 flex-1 custom-scrollbar">
              {drillDown.list.length === 0 ? (
                 <p className="text-sm text-gray-500 font-bold text-center py-8">No records found.</p>
              ) : (
                drillDown.list.map((item, idx) => {
                  if (drillDown.type === 'accounts') {
                    return (
                      <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl hover:border-primary/40 cursor-pointer group transition-colors" onClick={() => navigate(`/accounts/${item.accountId}`)}>
                        <div>
                          <p className="font-bold text-gray-900">{item.companyName}</p>
                          <p className={`text-xs font-bold mt-1 ${item.healthScore < 50 ? 'text-rose-500' : 'text-emerald-500'}`}>Health Score: {item.healthScore}%</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors" />
                      </div>
                    )
                  } else {
                    return (
                      <div key={idx} className="p-4 bg-gray-50 border border-gray-200 rounded-xl hover:border-primary/40 cursor-pointer group transition-colors" onClick={() => navigate(`/accounts/${item.accountId}`)}>
                        <div className="flex items-center justify-between mb-2">
                           <p className="font-bold text-gray-900">{item.companyName}</p>
                           <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                        </div>
                        <p className="text-sm font-medium text-gray-700">{item.suggestedAction}</p>
                        <p className="text-xs font-bold text-gray-500 mt-2 uppercase tracking-wide">{item.type} • {item.priority} Priority</p>
                      </div>
                    )
                  }
                })
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
