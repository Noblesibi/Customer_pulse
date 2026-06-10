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
        <div className="flex items-center gap-3">
          <div className="bg-[#0f172a] rounded-xl px-3 py-1.5">
            <img
              src="/nest-digital-logo.png"
              alt="Nest Digital"
              className="h-8 w-auto object-contain"
            />
          </div>
          <div className="border-l border-slate-600/40 pl-3">
            <span className="font-extrabold text-base text-white tracking-wide block">CustomerPulse</span>
            <span className="text-[9px] text-primary font-bold tracking-wider uppercase">Relationship Intelligence</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-500">
          <a href="#features" className="hover:text-slate-900 cursor-pointer">Features</a>
          <a href="#about" className="hover:text-slate-900 cursor-pointer">About Us</a>
          <a href="#contact" className="hover:text-slate-900 cursor-pointer">Contact Us</a>
        </nav>

        <div className="flex items-center gap-5">
          {user ? (
            <button 
              onClick={() => { logout(); navigate('/'); }}
              className="text-xs font-semibold text-slate-500 cursor-pointer"
            >
              Sign Out
            </button>
          ) : (
            <button 
              onClick={() => navigate('/login')}
              className="text-xs font-semibold text-slate-500 cursor-pointer"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 pt-16 pb-20 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7 space-y-6 text-center lg:text-left">

          <h1 className="text-4xl md:text-6xl font-black text-white leading-[1.15] tracking-tight">
            Stop Guessing. <br />
            Know Your <span style={{background: 'linear-gradient(90deg, #1a3a8f, #cc1f27)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'}}>Relationship Pulse</span>.
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

      {/* ── FEATURES SECTION ── */}
      <section id="features" className="max-w-7xl mx-auto px-6 md:px-12 py-20 border-t border-slate-900">
        <div className="text-center max-w-2xl mx-auto space-y-4 mb-16">
          <span className="inline-block bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">Platform Features</span>
          <h2 className="text-2xl md:text-4xl font-black text-white">Everything You Need to <br />Manage Relationships</h2>
          <p className="text-sm text-slate-400 leading-relaxed">CustomerPulse by NeST Digital provides a full-stack relationship intelligence layer for enterprise CRM teams.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: <Sparkles className="w-6 h-6" />, color: 'bg-primary/10 border-primary/20 text-primary', title: 'AI Sentiment Analysis', desc: 'Automatically parse Outlook & Teams messages using Gemini to detect frustration, churn intent, competitor evaluation, and renewal cues.' },
            { icon: <Activity className="w-6 h-6" />, color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', title: 'Live Health Scoring', desc: 'Compute weighted relationship health scores (0–100%) based on engagement frequency, contact depth, sentiment trends, and open risks.' },
            { icon: <ShieldAlert className="w-6 h-6" />, color: 'bg-rose-500/10 border-rose-500/20 text-rose-400', title: 'Risk Detection Center', desc: 'Flag and categorize churn risks in real-time. Account managers receive alerts and can log mitigation notes directly in the platform.' },
            { icon: <Users className="w-6 h-6" />, color: 'bg-amber-500/10 border-amber-500/20 text-amber-400', title: 'Contact & Account CRM', desc: 'Full account and contact management with stakeholder mapping, communication history, and relationship strength indicators.' },
            { icon: <Terminal className="w-6 h-6" />, color: 'bg-purple-500/10 border-purple-500/20 text-purple-400', title: 'MS Graph Webhooks', desc: 'Production-ready webhook pipeline for ingesting Microsoft 365 events — Outlook emails and Teams messages — in real time.' },
            { icon: <Award className="w-6 h-6" />, color: 'bg-teal-500/10 border-teal-500/20 text-teal-400', title: 'Executive Dashboards', desc: 'Role-based dashboards giving executives, sales managers, and employees the right insights at the right level of detail.' },
          ].map((f, i) => (
            <div key={i} className="glass p-6 rounded-2xl border border-slate-800/80 space-y-4">
              <div className={`border p-3 rounded-xl w-12 h-12 flex items-center justify-center ${f.color}`}>{f.icon}</div>
              <h3 className="text-sm font-bold text-white">{f.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── ABOUT US SECTION ── */}
      <section id="about" className="border-t border-slate-900 py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <span className="inline-block bg-[#1a3a8f]/10 border border-[#1a3a8f]/20 text-[#1a3a8f] text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">About NeST Digital</span>
            <h2 className="text-2xl md:text-4xl font-black text-white leading-tight">Engineering Transformation <br />Through Technology</h2>
            <p className="text-sm text-slate-400 leading-relaxed">NeST Digital is a global technology company delivering enterprise-grade digital transformation solutions. With decades of experience across industries, we build intelligent platforms that help organizations make data-driven decisions, optimize operations, and accelerate growth.</p>
            <p className="text-sm text-slate-400 leading-relaxed">CustomerPulse is our flagship AI-powered CRM intelligence platform — built to give sales teams unprecedented visibility into the health and trajectory of every client relationship.</p>
            <div className="grid grid-cols-3 gap-4 pt-4">
              {[['20+', 'Years Experience'], ['500+', 'Enterprise Clients'], ['50+', 'Countries Served']].map(([num, label]) => (
                <div key={label} className="glass rounded-xl p-4 border border-slate-800/60 text-center">
                  <div className="text-2xl font-black" style={{color: '#cc1f27'}}>{num}</div>
                  <div className="text-[10px] text-slate-400 font-semibold mt-1">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            {[
              { title: 'Our Mission', desc: 'To empower enterprise sales teams with AI-driven relationship intelligence that transforms how they understand, manage, and grow client partnerships.' },
              { title: 'Our Vision', desc: 'A world where every business relationship is deeply understood, proactively nurtured, and measurably healthy — powered by intelligent automation.' },
              { title: 'Our Values', desc: 'Innovation, integrity, and impact. We build technology that matters — secure, scalable, and designed for real-world enterprise complexity.' },
            ].map((item) => (
              <div key={item.title} className="glass rounded-2xl p-5 border border-slate-800/80 space-y-2">
                <h4 className="text-sm font-bold text-white">{item.title}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACT US SECTION ── */}
      <section id="contact" className="border-t border-slate-900 py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="text-center max-w-2xl mx-auto space-y-4 mb-16">
            <span className="inline-block bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">Get In Touch</span>
            <h2 className="text-2xl md:text-4xl font-black text-white">Let's Start a Conversation</h2>
            <p className="text-sm text-slate-400 leading-relaxed">Interested in CustomerPulse for your organization? Our team is ready to walk you through a personalized demo.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            {/* Contact Info */}
            <div className="space-y-6">
              {[
                { icon: <MessageSquare className="w-5 h-5" />, color: 'bg-primary/10 border-primary/20 text-primary', label: 'Email Us', value: 'sales@nestdigital.com', sub: 'We respond within 24 hours' },
                { icon: <Users className="w-5 h-5" />, color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', label: 'Sales Team', value: '+1 (800) 123-4567', sub: 'Mon–Fri, 9am–6pm IST' },
                { icon: <Zap className="w-5 h-5" />, color: 'bg-amber-500/10 border-amber-500/20 text-amber-400', label: 'Headquarters', value: 'Kochi, Kerala, India', sub: 'NeST Digital Park, Technopark' },
              ].map((c) => (
                <div key={c.label} className="glass rounded-2xl p-5 border border-slate-800/80 flex items-start gap-4">
                  <div className={`border p-3 rounded-xl flex items-center justify-center shrink-0 ${c.color}`}>{c.icon}</div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{c.label}</p>
                    <p className="text-sm font-bold text-white mt-0.5">{c.value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Contact Form */}
            <div className="glass rounded-2xl border border-slate-800/80 p-8 space-y-5">
              <h3 className="text-sm font-bold text-white">Send Us a Message</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 font-semibold uppercase block mb-1.5">First Name</label>
                  <input type="text" placeholder="John" className="w-full bg-dark-900/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary/50" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-semibold uppercase block mb-1.5">Last Name</label>
                  <input type="text" placeholder="Smith" className="w-full bg-dark-900/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary/50" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-semibold uppercase block mb-1.5">Work Email</label>
                <input type="email" placeholder="john@company.com" className="w-full bg-dark-900/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary/50" />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-semibold uppercase block mb-1.5">Company</label>
                <input type="text" placeholder="Your company name" className="w-full bg-dark-900/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary/50" />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-semibold uppercase block mb-1.5">Message</label>
                <textarea rows={4} placeholder="Tell us about your needs..." className="w-full bg-dark-900/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary/50 resize-none" />
              </div>
              <button className="w-full bg-primary text-white text-sm font-bold rounded-xl py-3 cursor-pointer">
                Send Message
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-900 py-10 relative z-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-[#0f172a] rounded-xl px-2 py-1">
              <img src="/nest-digital-logo.png" alt="NeST Digital" className="h-6 w-auto object-contain" />
            </div>
            <span className="text-xs text-slate-500 font-semibold">CustomerPulse</span>
          </div>
          <p className="text-xs text-slate-500">&copy; {new Date().getFullYear()} NeST Digital. All rights reserved.</p>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <a href="#features" className="hover:text-slate-300 cursor-pointer">Features</a>
            <a href="#about" className="hover:text-slate-300 cursor-pointer">About</a>
            <a href="#contact" className="hover:text-slate-300 cursor-pointer">Contact</a>
          </div>
        </div>
      </footer>


    </div>
  );
}
