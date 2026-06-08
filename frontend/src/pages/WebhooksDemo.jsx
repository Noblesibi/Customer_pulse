import React, { useState } from 'react';
import { Send, Terminal, Mail, MessageSquare, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useStore } from '../store/index.js';

export default function WebhooksDemo() {
  const { token } = useStore();
  const [webhookType, setWebhookType] = useState('outlook'); // 'outlook' or 'teams'
  const [senderEmail, setSenderEmail] = useState('s.jenkins@acme.com');
  const [subject, setSubject] = useState('Urgent: Deployment Escalation');
  const [messageText, setMessageText] = useState('Our system has been experiencing major latency. We are extremely concerned about the upcoming launch. If this is not resolved, we will switch to alternative platforms.');
  
  const [loading, setLoading] = useState(false);
  const [logResponse, setLogResponse] = useState(null);

  const handleSendWebhook = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLogResponse(null);

    const isOutlook = webhookType === 'outlook';
    const url = isOutlook 
      ? 'http://localhost:5000/api/webhooks/outlook' 
      : 'http://localhost:5000/api/webhooks/teams';

    const payload = isOutlook 
      ? { senderEmail, subject, bodyText: messageText, timestamp: new Date().toISOString() }
      : { senderEmail, messageText, timestamp: new Date().toISOString() };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setLogResponse({
        status: res.status,
        statusText: res.statusText,
        data
      });
    } catch (err) {
      setLogResponse({
        error: 'Network connection error. Ensure backend server is running.',
        message: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  const presetMessages = [
    {
      title: 'Competitor Mention (Outlook)',
      type: 'outlook',
      sender: 's.jenkins@acme.com',
      subject: 'Alternative Evaluation',
      text: 'Our stakeholders are requesting we evaluate competitor platforms due to pricing concerns. Let us set up an alignment call next week.'
    },
    {
      title: 'Shipment Delay complaint (Teams)',
      type: 'teams',
      sender: 'r.miller@globallogistics.com',
      subject: '',
      text: 'The cargo reports are late again because the API experienced latency. This is causing delivery delays. Extremely frustrated.'
    },
    {
      title: 'Positive QBR Feedback (Outlook)',
      type: 'outlook',
      sender: 's.jenkins@acme.com',
      subject: 'QBR Success',
      text: 'Thanks for the excellent support. The platform renewal has been approved by our finance team! We love the new stability.'
    }
  ];

  const applyPreset = (preset) => {
    setWebhookType(preset.type);
    setSenderEmail(preset.sender);
    setSubject(preset.subject);
    setMessageText(preset.text);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 select-none">
      
      {/* LEFT PANEL: WEBHOOK SIMULATOR CONSOLE */}
      <div className="glass p-6 rounded-2xl border border-slate-800/80 flex flex-col justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-wide">MS Graph Webhook Ingestion Sandbox</h2>
          <p className="text-xs text-slate-400 mt-1 mb-6">
            Simulate Outlook email webhooks and Teams chat events triggering the ingestion pipeline.
          </p>

          {/* Presets List */}
          <div className="mb-6 space-y-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Select Webhook Preset</span>
            <div className="flex flex-wrap gap-2.5">
              {presetMessages.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => applyPreset(p)}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-[10px] font-semibold text-slate-300 px-3 py-1.5 transition-colors"
                >
                  {p.title}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSendWebhook} className="space-y-4">
            
            {/* Event Selector Toggle */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Event Ingestion Channel</label>
              <div className="flex bg-dark-900 border border-slate-800 rounded-xl p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setWebhookType('outlook')}
                  className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all ${
                    webhookType === 'outlook' ? 'bg-primary text-white shadow' : 'text-slate-400'
                  }`}
                >
                  <Mail className="w-4 h-4" />
                  Outlook Webhook
                </button>
                <button
                  type="button"
                  onClick={() => setWebhookType('teams')}
                  className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all ${
                    webhookType === 'teams' ? 'bg-primary text-white shadow' : 'text-slate-400'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  Teams Webhook
                </button>
              </div>
            </div>

            {/* Sender Email Address */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Sender Email Address</label>
              <input
                type="email"
                required
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2.5 focus:outline-none focus:border-primary/50"
                placeholder="client@domain.com"
              />
            </div>

            {/* Outlook Subject (Only if Outlook toggle active) */}
            {webhookType === 'outlook' && (
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Email Subject Header</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2.5 focus:outline-none focus:border-primary/50"
                  placeholder="Email subject line..."
                />
              </div>
            )}

            {/* Message Body Text */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Message/Communication text body</label>
              <textarea
                required
                rows={5}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="w-full bg-dark-900/60 border border-slate-800 text-xs text-white rounded-lg p-2.5 focus:outline-none focus:border-primary/50 resize-none leading-relaxed"
                placeholder="Paste client text body..."
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-blue-600 text-xs text-white font-semibold rounded-lg py-3 flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-40"
            >
              <Send className="w-4 h-4 text-white" />
              {loading ? 'Ingesting event...' : 'Fire Ingestion Webhook'}
            </button>
          </form>
        </div>
      </div>

      {/* RIGHT PANEL: LOGS PARSING OUTPUT VIEW */}
      <div className="glass p-6 rounded-2xl border border-slate-800/80 flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <Terminal className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-bold text-white tracking-wide">Ingestion Logs Console</h2>
        </div>

        <div className="flex-1 bg-dark-950/80 border border-slate-800/80 rounded-2xl p-5 font-mono text-[11px] leading-relaxed overflow-y-auto max-h-[460px] text-slate-300">
          {logResponse ? (
            <div className="space-y-5">
              {/* Http Status Code Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="text-slate-400">Response Status:</span>
                <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                  logResponse.status === 201 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                }`}>
                  HTTP {logResponse.status || 'ERROR'} {logResponse.statusText}
                </span>
              </div>

              {logResponse.error ? (
                <div className="text-rose-400 space-y-2">
                  <div>[System Error] Webhook trigger failed.</div>
                  <div>Message: {logResponse.message}</div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Pipeline Step 1 */}
                  <div>
                    <span className="text-emerald-400 font-bold block">&gt; Step 1: Microsoft Graph Ingested</span>
                    <span className="text-slate-400">Communication received on webhook endpoint. Identified account domain.</span>
                  </div>

                  {/* Pipeline Step 2 */}
                  <div>
                    <span className="text-emerald-400 font-bold block">&gt; Step 2: Gemini AI Analysis parsing</span>
                    <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/60 space-y-1.5 mt-1.5">
                      <div><span className="text-slate-400">Detected Sentiment:</span> <span className={`font-semibold ${
                        logResponse.data.analysis.sentiment === 'Positive' ? 'text-emerald-400' : 
                        logResponse.data.analysis.sentiment === 'Negative' ? 'text-rose-400' : 
                        'text-amber-400'
                      }`}>{logResponse.data.analysis.sentiment}</span></div>
                      <div><span className="text-slate-400">Risk detected status:</span> <span className={logResponse.data.interaction.riskDetected ? 'text-rose-400 font-semibold' : 'text-slate-500'}>{logResponse.data.interaction.riskDetected ? 'TRUE' : 'FALSE'}</span></div>
                      {logResponse.data.interaction.riskDetected && (
                        <>
                          <div><span className="text-slate-400">Risk Category:</span> <span className="text-rose-400 font-semibold">{logResponse.data.analysis.riskCategory}</span></div>
                          <div><span className="text-slate-400">Risk Level/Severity Score:</span> <span className="text-rose-400 font-semibold">{logResponse.data.analysis.riskLevel} (Severity: {logResponse.data.analysis.severity}/100)</span></div>
                        </>
                      )}
                      <div><span className="text-slate-400">AI Summary Text:</span> <span className="text-slate-300 italic">"{logResponse.data.analysis.summary}"</span></div>
                    </div>
                  </div>

                  {/* Pipeline Step 3 */}
                  <div>
                    <span className="text-emerald-400 font-bold block">&gt; Step 3: Firestore state saved & Health updated</span>
                    <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/60 mt-1.5">
                      <div><span className="text-slate-400">Recalculated Health Score:</span> <span className="text-white font-bold">{logResponse.data.health.healthScore}%</span></div>
                      <div><span className="text-slate-400">Health Score Status classification:</span> <span className="text-white font-bold">{logResponse.data.health.status}</span></div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-500 text-[10px] border-t border-slate-800/60 pt-3">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Real-time dashboard state updated and Toast notification triggers dispatched.</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col justify-center items-center gap-2 text-slate-500 py-12">
              <Terminal className="w-8 h-8 text-slate-700" />
              <span>Submit a webhook payload on the left to review the execution output.</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
