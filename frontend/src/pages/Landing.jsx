import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Sparkles, Activity, ShieldAlert, Terminal, ArrowRight, ShieldCheck, Heart, 
  MessageSquare, Users, Award, Zap, ChevronRight 
} from 'lucide-react';
import { useStore } from '../store/index.js';

export default function Landing() {
  const navigate = useNavigate();
  const { user, logout } = useStore();

  // Interactive calculator state
  const [calcEngagement, setCalcEngagement] = useState(80);
  const [calcDepth, setCalcDepth] = useState(70);
  const [calcSentiment, setCalcSentiment] = useState(90);
  const [calcRisk, setCalcRisk] = useState(100);

  // Compute live score from sliders
  const calculatedScore = Math.round(
    (calcEngagement * 0.25) +
    (calcDepth * 0.25) +
    (calcSentiment * 0.25) +
    (calcRisk * 0.25)
  );

  const getCalcStatus = (score) => {
    if (score >= 90) return { label: 'Excellent', color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' };
    if (score >= 75) return { label: 'Healthy', color: 'text-blue-400 border-blue-500/20 bg-blue-500/5' };
    if (score >= 50) return { label: 'Warning', color: 'text-amber-400 border-amber-500/20 bg-amber-500/5' };
    return { label: 'Critical', color: 'text-rose-500 border-rose-500/20 bg-rose-500/5 animate-pulse' };
  };

  const statusInfo = getCalcStatus(calculatedScore);

  return (
    <div className="min-h-screen bg-dark-950 text-slate-100 font-sans selection:bg-primary selection:text-white relative overflow-hidden select-none">
      
      {/* Background ambient lighting */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-primary/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-15%] w-[55%] h-[55%] rounded-full bg-emerald-500/5 blur-[130px] pointer-events-none" />

      {/* NAVBAR */}
      <header className="h-20 max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between relative z-20">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/20 p-2 rounded-xl border border-primary/45 text-primary animate-soft-pulse">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <span className="font-extrabold text-base text-white tracking-wide block">CustomerPulse</span>
            <span className="text-[9px] text-primary font-bold tracking-wider uppercase">Relationship Intelligence</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-400">
          <a href="#features" className="hover:text-white transition-colors">Platform Features</a>
          <a href="#calculator" className="hover:text-white transition-colors">Health Formula</a>
          <a href="#integration" className="hover:text-white transition-colors">API Architecture</a>
        </nav>

        <div className="flex items-center gap-5">
          {user ? (
            <>
              <button 
                onClick={() => {
                  logout();
                  navigate('/');
                }}
                className="text-xs font-semibold text-slate-450 hover:text-white transition-colors cursor-pointer"
              >
                Sign Out
              </button>
              <button 
                onClick={() => navigate('/dashboard')}
                className="glass hover:bg-primary hover:border-primary/20 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-1.5 cursor-pointer"
              >
                Go to Console
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => navigate('/login')}
                className="text-xs font-semibold text-slate-450 hover:text-white transition-colors cursor-pointer"
              >
                Sign In
              </button>
              <button 
                onClick={() => navigate('/login')}
                className="glass hover:bg-primary hover:border-primary/20 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-1.5 cursor-pointer"
              >
                Launch CRM
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 pt-16 pb-20 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/25 rounded-full px-4 py-1.5 text-xs text-primary font-bold animate-soft-pulse mx-auto lg:mx-0">
            <Sparkles className="w-3.5 h-3.5" />
            AI-POWERED RELATIONSHIP CRM
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-white leading-[1.15] tracking-tight">
            Stop Guessing. <br />
            Know Your <span className="bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">Relationship Pulse</span>.
          </h1>
          <p className="text-sm md:text-base text-slate-400 leading-relaxed max-w-xl mx-auto lg:mx-0">
            Monitor client accounts, transcribe communication sentiments with Gemini, flag churn risks in real-time, and compute relationship health using weighted Graph analytics.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start pt-4">
            <button 
              onClick={() => navigate(user ? '/dashboard' : '/login')}
              className="bg-primary hover:bg-blue-600 active:scale-98 text-xs font-bold px-7 py-4 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all text-white"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </button>
            <a 
              href="#calculator"
              className="glass hover:bg-slate-800/40 text-xs font-bold px-7 py-4 rounded-xl flex items-center justify-center gap-1.5 transition-all"
            >
              Interactive Formula
            </a>
          </div>
        </div>

        {/* Hero Visual Mockup */}
        <div className="lg:col-span-5 relative">
          <div className="glass rounded-3xl border-slate-800 p-6 shadow-2xl relative z-10 transform hover:scale-[1.01] transition-transform duration-300">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 mb-4">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">AI Insight Feed</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            </div>
            
            <div className="space-y-4">
              <div className="bg-dark-900/60 border border-slate-800 p-4 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className="text-white">Acme Corp</span>
                  <span className="text-emerald-400">92% Excellent</span>
                </div>
                <p className="text-[11px] text-slate-300">"We renewals have been confirmed. Team is happy with recent rollouts."</p>
              </div>

              <div className="bg-dark-900/60 border border-slate-800/80 p-4 rounded-xl space-y-2 border-l-2 border-l-rose-500">
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className="text-white">Global Logistics</span>
                  <span className="text-rose-500">42% Critical</span>
                </div>
                <p className="text-[11px] text-rose-300">"Experienced major system latency. Reviewing competitor solutions."</p>
                <span className="text-[9px] bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded font-bold uppercase inline-block">
                  Risk: Competitor Mentions
                </span>
              </div>
            </div>
          </div>

          {/* Decorative glowing gradient sphere */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4/5 h-4/5 bg-primary/20 blur-[90px] rounded-full pointer-events-none" />
        </div>
      </section>

      {/* CORE MODULES / FEATURES */}
      <section id="features" className="max-w-7xl mx-auto px-6 md:px-12 py-20 border-t border-slate-900">
        <div className="text-center max-w-2xl mx-auto space-y-4 mb-16">
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-wide">Autonomous Account Diagnostics</h2>
          <p className="text-xs md:text-sm text-slate-400 leading-relaxed">
            Four powerful features driving client alignment and risk detection.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* AI Sentiment Analysis */}
          <div className="glass p-6 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition-colors space-y-4">
            <div className="bg-primary/10 border border-primary/20 text-primary p-3 rounded-xl w-12 h-12 flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Gemini Sentiment Parsing</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Analyzes incoming communications to detect customer frustration, competitor evaluations, pricing concerns, and contract renewal cues.
            </p>
          </div>

          {/* Dynamic Health Scores */}
          <div className="glass p-6 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition-colors space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl w-12 h-12 flex items-center justify-center">
              <Activity className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Weighted Health Metrics</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Computes health aggregates instantly based on communication frequencies, stakeholder depth, recent rolling sentiments, and open risks.
            </p>
          </div>

          {/* Real-time Risk Mitigation */}
          <div className="glass p-6 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition-colors space-y-4">
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl w-12 h-12 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Risk Alarm Management</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Dispatches visual notification toasts and adds warnings to the Risk Center. Allows account owners to log mitigation steps.
            </p>
          </div>

          {/* Microsoft Graph Integration */}
          <div className="glass p-6 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition-colors space-y-4">
            <div className="bg-purple-500/10 border border-purple-500/20 text-purple-400 p-3 rounded-xl w-12 h-12 flex items-center justify-center">
              <Terminal className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Graph Webhook Pipeline</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Production ready ingestion points for Outlook and Teams messages to feed, verify, and recalculate customer statuses automatically.
            </p>
          </div>
        </div>
      </section>

      {/* INTERACTIVE FORMULA CALCULATOR */}
      <section id="calculator" className="max-w-7xl mx-auto px-6 md:px-12 py-20 border-t border-slate-900 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <div className="inline-block bg-emerald-500/10 border border-emerald-500/25 px-3 py-1 rounded-full text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
            Weighted Score Formula
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-wide leading-tight">
            Try the Interactive <br />Relationship Health Engine
          </h2>
          <p className="text-xs md:text-sm text-slate-400 leading-relaxed">
            The platform weights four core customer signals equally (25% each) to score customer relationships: Engagement recency, Stakeholder hierarchy depth, Rolling sentiments, and Unresolved risks.
          </p>

          {/* Formula weights visualizer */}
          <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
            <div className="bg-dark-900 border border-slate-800/80 p-3.5 rounded-xl">
              <span className="text-slate-400 block mb-0.5">Engagement Rate</span>
              <span className="text-primary font-bold">25% Weight</span>
            </div>
            <div className="bg-dark-900 border border-slate-800/80 p-3.5 rounded-xl">
              <span className="text-slate-400 block mb-0.5">Contact Coverage</span>
              <span className="text-emerald-400 font-bold">25% Weight</span>
            </div>
            <div className="bg-dark-900 border border-slate-800/80 p-3.5 rounded-xl">
              <span className="text-slate-400 block mb-0.5">Sentiment Roll</span>
              <span className="text-amber-400 font-bold">25% Weight</span>
            </div>
            <div className="bg-dark-900 border border-slate-800/80 p-3.5 rounded-xl">
              <span className="text-slate-400 block mb-0.5">Risks Mitigation</span>
              <span className="text-rose-500 font-bold">25% Weight</span>
            </div>
          </div>
        </div>

        {/* Live Simulator Widget */}
        <div className="glass rounded-3xl border-slate-800 p-6 md:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase">Interactive Calculator</span>
            <div className={`px-3 py-1 rounded-lg border text-[10px] font-bold uppercase ${statusInfo.color}`}>
              {calculatedScore}% - {statusInfo.label}
            </div>
          </div>

          <div className="space-y-4">
            {/* Slide: Engagement */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Engagement Frequency</span>
                <span className="text-primary font-bold">{calcEngagement}%</span>
              </div>
              <input 
                type="range" min="0" max="100" 
                value={calcEngagement} 
                onChange={(e) => setCalcEngagement(parseInt(e.target.value))}
                className="w-full h-1.5 bg-dark-900 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            {/* Slide: Stakeholder Depth */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Relationship/Contact Depth</span>
                <span className="text-emerald-400 font-bold">{calcDepth}%</span>
              </div>
              <input 
                type="range" min="0" max="100" 
                value={calcDepth} 
                onChange={(e) => setCalcDepth(parseInt(e.target.value))}
                className="w-full h-1.5 bg-dark-900 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>

            {/* Slide: Sentiment Rolling */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Rolling sentiment</span>
                <span className="text-amber-400 font-bold">{calcSentiment}%</span>
              </div>
              <input 
                type="range" min="0" max="100" 
                value={calcSentiment} 
                onChange={(e) => setCalcSentiment(parseInt(e.target.value))}
                className="w-full h-1.5 bg-dark-900 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>

            {/* Slide: Risks Signals */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Risk Signal Cleanliness</span>
                <span className="text-rose-500 font-bold">{calcRisk}%</span>
              </div>
              <input 
                type="range" min="0" max="100" 
                value={calcRisk} 
                onChange={(e) => setCalcRisk(parseInt(e.target.value))}
                className="w-full h-1.5 bg-dark-900 rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-900 py-8 text-center text-xs text-slate-500 relative z-20">
        <p>&copy; {new Date().getFullYear()} Customer Pulse Inc. All corporate rights reserved.</p>
      </footer>

    </div>
  );
}
