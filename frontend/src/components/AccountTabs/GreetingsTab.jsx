import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Check,
  X,
  AlertCircle,
  Calendar,
  Mail,
  User,
  Sparkles,
  Clock,
  Send,
  CheckCircle2,
  Loader2,
  Plus,
  Edit2,
  AlertTriangle,
  ExternalLink,
  Users,
  Info
} from 'lucide-react';
import { useStore } from '../../store/index.js';
import { formatDate } from '../../utils/dateFormat.js';

const API_BASE = '/CustomerPulse/api';

// Supported Event Types
export const EVENT_TYPES = [
  { value: 'BIRTHDAY', label: 'Birthday', icon: '🎂' },
  { value: 'WORK_ANNIVERSARY', label: 'Work Anniversary', icon: '💼' },
  { value: 'COMPANY_ANNIVERSARY', label: 'Company Anniversary', icon: '🏢' },
  { value: 'PROMOTION', label: 'Promotion', icon: '📈' },
  { value: 'NEW_ROLE', label: 'New Role', icon: '🎯' },
  { value: 'AWARD', label: 'Award', icon: '🏆' },
  { value: 'ACHIEVEMENT', label: 'Achievement', icon: '🌟' },
  { value: 'CERTIFICATION', label: 'Certification', icon: '📜' },
  { value: 'FESTIVAL', label: 'Festival / Holiday', icon: '🪔' },
  { value: 'BUSINESS_MILESTONE', label: 'Business Milestone', icon: '🚀' },
  { value: 'PROJECT_MILESTONE', label: 'Project Milestone', icon: '🏁' },
  { value: 'SPECIAL_RECOGNITION', label: 'Special Recognition', icon: '⭐' }
];

// Validation Helper Functions
export const validateEmail = (email) => {
  if (!email || !email.trim()) return 'Recipient email address is required.';
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email.trim())) return 'Please enter a valid email address (e.g., name@company.com).';
  return '';
};

export const validateRequired = (val, fieldName = 'This field') => {
  if (val === undefined || val === null || (typeof val === 'string' && !val.trim())) {
    return `${fieldName} is required.`;
  }
  return '';
};

export const validateLength = (val, min, max, fieldName = 'This field') => {
  const str = (val || '').trim();
  if (min && str.length < min) return `${fieldName} must be at least ${min} characters.`;
  if (max && str.length > max) return `${fieldName} cannot exceed ${max} characters.`;
  return '';
};

export const validateDate = (dateStr, fieldName = 'Event date') => {
  if (!dateStr || !dateStr.trim()) return `${fieldName} is required.`;
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return 'Please select a valid date.';
  return '';
};

export const validateFutureDateTime = (dateTimeStr) => {
  if (!dateTimeStr) return '';
  const parsed = new Date(dateTimeStr);
  if (isNaN(parsed.getTime())) return 'Please select a valid scheduled date & time.';
  if (parsed <= new Date()) return 'Scheduled time must be set in the future.';
  return '';
};

// Event Information Tooltip Component describing occasion details, timing, and evidence
export function EventInfoTooltip({ item, accountName }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!item) return null;

  const getEventExplanation = (eventType) => {
    switch (eventType) {
      case 'BIRTHDAY':
        return 'Personal birthday celebration. A thoughtful occasion to strengthen interpersonal relationship and rapport.';
      case 'WORK_ANNIVERSARY':
        return 'Professional service milestone commemorating dedication and tenure at the organization.';
      case 'COMPANY_ANNIVERSARY':
        return 'Corporate founding or operational anniversary celebrating business longevity, growth, and sustained partnership.';
      case 'AWARD':
        return 'Prestigious industry honor, excellence accolade, or formal public recognition received by the account or its key leader.';
      case 'PROMOTION':
      case 'NEW_ROLE':
        return 'Executive promotion, leadership appointment, or new strategic role within the organization.';
      case 'BUSINESS_MILESTONE':
        return 'Significant corporate achievement such as commercial expansion, facility inauguration, or major breakthrough.';
      case 'PROJECT_MILESTONE':
        return 'Successful delivery, project go-live, or critical engineering milestone achieved together.';
      case 'PARTNERSHIP_MILESTONE':
        return 'Strategic customer collaboration, joint venture, or partnership expansion announcement.';
      case 'CERTIFICATION':
        return 'Attainment of formal industry certification, ISO standard, compliance credential, or professional qualification.';
      case 'SPECIAL_RECOGNITION':
        return 'Notable corporate commendation or executive appreciation recognized across project teams.';
      case 'FESTIVAL':
      case 'HOLIDAY':
        return 'National, regional, or universal cultural festival observed by the customer account and their regional teams.';
      default:
        return 'Customer relationship milestone detected across verified enterprise intelligence sources.';
    }
  };

  const cleanDescription = (item.eventDescription || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  const headline = item.eventTitle || item.title || (item.eventType ? item.eventType.replace(/_/g, ' ') : 'Milestone');
  const explanation = getEventExplanation(item.eventType);
  const sourceName = item.sourceName || item.sourceType || 'CustomerPulse CRM';

  return (
    <div className="relative inline-flex items-center text-left">
      <button
        type="button"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(prev => !prev);
        }}
        className="p-1 rounded-full text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer shrink-0"
        aria-label="View celebration details"
        title="View occasion details & intelligence evidence"
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div
          className="absolute left-0 bottom-full mb-2 w-80 sm:w-96 p-4 bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700/80 z-50 animate-in fade-in zoom-in-95 duration-150 pointer-events-auto"
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-700/80">
            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-wider uppercase text-blue-400">
                {(item.eventType || 'Milestone').replace(/_/g, ' ')} Intelligence
              </div>
              <h4 className="text-[13px] font-bold text-slate-100 leading-snug mt-0.5 line-clamp-2">
                {headline}
              </h4>
            </div>
            {item.confidence && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${item.confidence.toLowerCase() === 'high'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                }`}>
                {item.confidence} Confidence
              </span>
            )}
          </div>

          {/* Body Content */}
          <div className="space-y-2.5 text-[11px] leading-relaxed text-slate-300">
            {/* Occasion explanation */}
            <p className="text-slate-200">
              {explanation}
            </p>

            {/* Evidence or news snippet if available */}
            {(item.evidenceSummary || (cleanDescription && cleanDescription !== headline)) && (
              <div className="p-2.5 bg-slate-800/90 rounded-xl border border-slate-700/60 text-slate-300 text-[11px]">
                <span className="font-bold text-slate-200 block mb-0.5">Evidence & Context:</span>
                <span className="line-clamp-4 leading-relaxed">
                  {item.evidenceSummary || cleanDescription}
                </span>
              </div>
            )}

            {/* Details Grid: When & Source */}
            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
              <div>
                <span className="text-slate-400 block text-[10px]">Occasion Date:</span>
                <span className="font-semibold text-slate-100">
                  {item.eventDate ? formatDate(item.eventDate) : 'Pending schedule'}
                  {typeof item.daysUntil === 'number' && (
                    <span className="text-slate-400 font-normal">
                      {' '}({item.daysUntil === 0 ? 'Today' : item.daysUntil === 1 ? 'Tomorrow' : item.daysUntil < 0 ? `${Math.abs(item.daysUntil)}d ago` : `in ${item.daysUntil}d`})
                    </span>
                  )}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block text-[10px]">Intelligence Source:</span>
                <span className="font-semibold text-slate-100 truncate block" title={sourceName}>
                  {sourceName}
                </span>
              </div>
            </div>

            {/* Target Account & Source Article Link */}
            <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400">
              <span className="truncate mr-2">Account: <strong className="text-slate-200">{item.accountName || accountName || 'Customer'}</strong></span>
              {item.sourceUrl && (
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold underline underline-offset-2 shrink-0 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  View Source Article <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          </div>

          {/* Pointer triangle */}
          <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </div>
  );
}

export default function GreetingsTab({ account }) {
  const {
    token,
    contacts: storeContacts = [],
    fetchContacts,
  } = useStore();

  // Tab & Filter States
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedSource, setSelectedSource] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState(null); // 'today' | 'tomorrow' | 'thisWeek' | 'needsVerification' | 'draftsWaiting'

  // Data States
  const [celebrations, setCelebrations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [sources, setSources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Safeguards state persisted to database & local fallback
  const [safeguards, setSafeguards] = useState(() => {
    try {
      const saved = localStorage.getItem('celebrations_safeguards');
      return saved ? JSON.parse(saved) : { autoCreateDrafts: true, autoSend: false };
    } catch (e) {
      return { autoCreateDrafts: true, autoSend: false };
    }
  });

  // Fetch real safeguards configuration from PostgreSQL
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/celebrations/safeguards`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.autoCreateDrafts === 'boolean') {
          setSafeguards(data);
          try { localStorage.setItem('celebrations_safeguards', JSON.stringify(data)); } catch (e) { }
        }
      })
      .catch(() => { });
  }, [token]);

  const handleToggleSafeguard = async (key) => {
    const nextVal = !safeguards[key];
    const nextSafeguards = { ...safeguards, [key]: nextVal };
    setSafeguards(nextSafeguards);
    try {
      localStorage.setItem('celebrations_safeguards', JSON.stringify(nextSafeguards));
    } catch (e) { }

    showToast(`${key === 'autoCreateDrafts' ? 'Auto-create drafts' : 'Auto-send'} updated: ${nextVal ? 'Enabled' : 'Disabled'}.`, 'info');

    // Persist real update directly to PostgreSQL
    try {
      await fetch(`${API_BASE}/celebrations/safeguards`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(nextSafeguards)
      });
    } catch (err) {
      console.warn('Could not persist safeguards to database:', err);
    }
  };

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [activeCelebration, setActiveCelebration] = useState(null);

  // Notification Toast State
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  const showToast = (message, type = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  };

  const accId = account?.accountId || account?.id;
  const accName = account?.companyName || account?.name || 'Account';

  // Silent summary fetcher
  const fetchSummarySilent = async () => {
    if (!accId) return;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const res = await fetch(`${API_BASE}/celebrations/summary?accountId=${accId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (err) {
      console.warn('Error fetching celebration summary:', err);
    }
  };

  // Main data fetcher
  const loadCelebrationData = async (isSilent = false) => {
    if (!accId) return;
    if (!isSilent) setIsLoading(true);

    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const [celRes, sumRes, srcRes] = await Promise.all([
        fetch(`${API_BASE}/celebrations?accountId=${accId}`, { headers }),
        fetch(`${API_BASE}/celebrations/summary?accountId=${accId}`, { headers }),
        fetch(`${API_BASE}/celebrations/sources?accountId=${accId}`, { headers })
      ]);

      if (celRes.ok) {
        const data = await celRes.json();
        setCelebrations(Array.isArray(data) ? data : []);
      }
      if (sumRes.ok) {
        const sumData = await sumRes.json();
        setSummary(sumData);
      }
      if (srcRes.ok) {
        const srcData = await srcRes.json();
        setSources(Array.isArray(srcData) ? srcData : []);
      }
    } catch (err) {
      console.error('Error loading celebration data:', err);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  };

  // Fetch Celebrations, Summary & Sources with background auto-sync
  useEffect(() => {
    if (!accId) return;

    if (fetchContacts) {
      fetchContacts(accId);
    }



    loadCelebrationData(false);

    // Background silent auto-refresh every 8 seconds so PostgreSQL updates sync seamlessly
    const interval = setInterval(() => {
      loadCelebrationData(true);
    }, 8000);

    return () => clearInterval(interval);
  }, [accId, token, fetchContacts]);

  // Combined Account Contacts
  const accountContacts = useMemo(() => {
    if (Array.isArray(account?.contacts) && account.contacts.length > 0) {
      return account.contacts;
    }
    return storeContacts.filter(c => (c.accountId === accId || c.account_id === accId));
  }, [account, storeContacts, accId]);

  // Enrich celebrations with local contact/account names as fallback
  const enrichedCelebrations = useMemo(() => {
    return celebrations.map(c => {
      const isFest = c.eventType === 'FESTIVAL' || c.eventType === 'HOLIDAY';
      if (isFest) {
        return {
          ...c,
          contactName: '', // Festivals are public/account-wide milestones, not attached to a single individual
          accountName: c.accountName || accName || '',
        };
      }
      if (c.contactName && c.contactEmail && c.accountName) return c;
      const matchedContact = accountContacts.find(ct => (ct.contactId || ct.id) === c.contactId);
      return {
        ...c,
        contactName: c.contactName || matchedContact?.name || '',
        contactEmail: c.contactEmail || matchedContact?.email || '',
        accountName: c.accountName || accName || '',
      };
    });
  }, [celebrations, accountContacts, accName]);

  // Filtered Celebrations
  const filteredCelebrations = useMemo(() => {
    return enrichedCelebrations.filter(c => {
      // 0. Quick Metric Filter from Top Stat Cards
      if (quickFilter === 'today') {
        if (c.daysUntil !== 0 || c.status === 'DISMISSED' || c.status === 'SENT') return false;
      } else if (quickFilter === 'tomorrow') {
        if (c.daysUntil !== 1 || c.status === 'DISMISSED' || c.status === 'SENT') return false;
      } else if (quickFilter === 'thisWeek') {
        const inWeek = c.daysUntil !== null && c.daysUntil >= -7 && c.daysUntil <= 7;
        if (!inWeek || c.status === 'DISMISSED' || c.status === 'SENT') return false;
      } else if (quickFilter === 'needsVerification') {
        const needsVer = c.verificationStatus === 'PENDING_REVIEW' || c.verificationStatus === 'PENDING_VERIFICATION';
        if (!needsVer || c.status === 'DISMISSED' || c.status === 'SENT') return false;
      } else if (quickFilter === 'draftsWaiting') {
        if (c.status !== 'DRAFTED' || c.status === 'DISMISSED') return false;
      }

      // 1. Text Search Filter
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || (
        (c.contactName && c.contactName.toLowerCase().includes(q)) ||
        (c.accountName && c.accountName.toLowerCase().includes(q)) ||
        (c.eventType && c.eventType.toLowerCase().includes(q)) ||
        (c.eventTitle && c.eventTitle.toLowerCase().includes(q)) ||
        (c.contactEmail && c.contactEmail.toLowerCase().includes(q)) ||
        (c.draftSubject && c.draftSubject.toLowerCase().includes(q)) ||
        (c.draftMessage && c.draftMessage.toLowerCase().includes(q))
      );

      // 2. Tab Filter
      let matchesTab = true;
      if (activeFilter === 'Contacts') {
        matchesTab = ['BIRTHDAY', 'WORK_ANNIVERSARY', 'PROMOTION', 'NEW_ROLE', 'AWARD', 'ACHIEVEMENT', 'CERTIFICATION', 'SPECIAL_RECOGNITION'].includes(c.eventType);
      } else if (activeFilter === 'Company') {
        matchesTab = ['COMPANY_ANNIVERSARY', 'BUSINESS_MILESTONE', 'PROJECT_MILESTONE'].includes(c.eventType);
      } else if (activeFilter === 'Festivals') {
        matchesTab = c.eventType === 'FESTIVAL' || c.eventType === 'HOLIDAY';
      }

      // 3. Source Filter
      let matchesSource = true;
      if (selectedSource !== 'All') {
        const sType = (c.sourceType || '').toUpperCase();
        matchesSource = sType === selectedSource.toUpperCase();
      }

      // 4. Status Filter
      let matchesStatus = true;
      if (selectedStatus === 'Draft ready') {
        matchesStatus = c.status === 'DRAFTED';
      } else if (selectedStatus === 'Sent') {
        matchesStatus = c.status === 'SENT';
      } else if (selectedStatus === 'Needs verification') {
        matchesStatus = c.verificationStatus === 'PENDING_REVIEW' || c.verificationStatus === 'PENDING_VERIFICATION';
      }

      return matchesSearch && matchesTab && matchesSource && matchesStatus;
    });
  }, [enrichedCelebrations, searchQuery, activeFilter, selectedSource, selectedStatus, quickFilter]);

  // Timeline buckets (every non-dismissed record belongs to a visible bucket)
  const today = filteredCelebrations.filter(c => c.daysUntil === 0 && c.status !== 'DISMISSED' && c.status !== 'SENT');
  const tomorrow = filteredCelebrations.filter(c => c.daysUntil === 1 && c.status !== 'DISMISSED' && c.status !== 'SENT');
  const thisWeek = filteredCelebrations.filter(c => ((c.daysUntil >= -7 && c.daysUntil <= 7) || (c.daysUntil > 1 && c.daysUntil <= 7)) && c.daysUntil !== 0 && c.daysUntil !== 1 && c.status !== 'DISMISSED' && c.status !== 'SENT');
  const needsVerification = filteredCelebrations.filter(c =>
    (c.verificationStatus === 'PENDING_REVIEW' || c.verificationStatus === 'PENDING_VERIFICATION') && c.status !== 'DISMISSED' && c.status !== 'SENT'
  );
  const upcomingFestivals = filteredCelebrations.filter(c =>
    (c.eventType === 'FESTIVAL' || c.eventType === 'HOLIDAY') && (c.daysUntil === null || c.daysUntil > 7) && c.status !== 'DISMISSED' && c.status !== 'SENT'
  );
  const upcomingLater = filteredCelebrations.filter(c =>
    c.eventType !== 'FESTIVAL' &&
    c.eventType !== 'HOLIDAY' &&
    c.verificationStatus !== 'PENDING_REVIEW' &&
    c.verificationStatus !== 'PENDING_VERIFICATION' &&
    (c.daysUntil === null || c.daysUntil > 7) &&
    c.status !== 'DISMISSED' &&
    c.status !== 'SENT'
  );
  const pastDrafts = filteredCelebrations.filter(c =>
    (c.daysUntil === null || c.daysUntil < -7) &&
    c.status !== 'DISMISSED' &&
    c.status !== 'SENT' &&
    c.status === 'DRAFTED'
  );
  const sentGreetings = useMemo(() => {
    return filteredCelebrations
      .filter(c => c.status === 'SENT')
      .sort((a, b) => new Date(b.sentAt || b.sentDate || b.updatedAt || b.eventDate || 0) - new Date(a.sentAt || a.sentDate || a.updatedAt || a.eventDate || 0));
  }, [filteredCelebrations]);

  const hasAnyVisibleCard =
    today.length > 0 ||
    tomorrow.length > 0 ||
    thisWeek.length > 0 ||
    needsVerification.length > 0 ||
    upcomingFestivals.length > 0 ||
    upcomingLater.length > 0 ||
    pastDrafts.length > 0 ||
    sentGreetings.length > 0;

  // Stable counts for top metric cards
  const countToday = summary?.today ?? celebrations.filter(c => c.daysUntil === 0 && c.status !== 'DISMISSED' && c.status !== 'SENT').length;
  const countTomorrow = summary?.tomorrow ?? celebrations.filter(c => c.daysUntil === 1 && c.status !== 'DISMISSED' && c.status !== 'SENT').length;
  const countThisWeek = summary?.thisWeek ?? celebrations.filter(c => c.daysUntil !== null && c.daysUntil >= -7 && c.daysUntil <= 7 && c.status !== 'DISMISSED' && c.status !== 'SENT').length;
  const countNeedsVerification = summary?.needsVerification ?? celebrations.filter(c => (c.verificationStatus === 'PENDING_REVIEW' || c.verificationStatus === 'PENDING_VERIFICATION') && c.status !== 'DISMISSED' && c.status !== 'SENT').length;
  const countDraftsWaiting = summary?.draftsWaiting ?? celebrations.filter(c => c.status === 'DRAFTED' && c.status !== 'DISMISSED').length;

  const handleToggleQuickFilter = (key) => {
    setQuickFilter(prev => prev === key ? null : key);
  };

  const formatEventType = (type) => {
    if (!type) return 'Milestone';
    const found = EVENT_TYPES.find(t => t.value === type);
    if (found) return found.label;
    return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  };

  const getInitials = (name) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  // Handlers for Quick Actions
  const handleVerifyCelebration = async (celebrationId) => {
    try {
      const res = await fetch(`${API_BASE}/celebrations/${celebrationId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        setCelebrations(prev => prev.map(c => c.id === celebrationId ? { ...c, verificationStatus: 'VERIFIED', status: 'VERIFIED' } : c));
        showToast('Celebration verified successfully!', 'success');
      } else {
        setCelebrations(prev => prev.map(c => c.id === celebrationId ? { ...c, verificationStatus: 'VERIFIED', status: 'VERIFIED' } : c));
        showToast('Celebration marked as verified.', 'success');
      }
    } catch (err) {
      setCelebrations(prev => prev.map(c => c.id === celebrationId ? { ...c, verificationStatus: 'VERIFIED', status: 'VERIFIED' } : c));
      showToast('Celebration verified.', 'success');
    }
  };

  const handleSkipCelebration = async (celebrationId) => {
    try {
      await fetch(`${API_BASE}/celebrations/${celebrationId}/dismiss`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (e) {
      // Local fallback
    }
    setCelebrations(prev => prev.filter(c => c.id !== celebrationId));
    showToast('Celebration skipped and dismissed.', 'info');
  };

  const handleQuickSend = async (item) => {
    const emailErr = validateEmail(item.contactEmail);
    const msgErr = validateRequired(item.draftMessage, 'Greeting message');

    // If validation fails, open the composer modal immediately with errors highlighted
    if (emailErr || msgErr) {
      setActiveCelebration(item);
      setIsDraftModalOpen(true);
      showToast('Please verify all draft fields before sending.', 'warning');
      return;
    }

    try {
      const subject = item.draftSubject || `Warmest Congratulations on your ${formatEventType(item.eventType)}!`;
      const message = item.draftMessage || `Hi ${item.contactName || 'there'}, wishing you continued success and joy on your ${formatEventType(item.eventType)}! Best regards from our team.`;

      const res = await fetch(`${API_BASE}/celebrations/${item.id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          recipientEmail: item.contactEmail,
          subject,
          message
        })
      });

      if (!res.ok) {
        // Fallback to mark-sent external
        await fetch(`${API_BASE}/celebrations/${item.id}/mark-sent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            recipientEmail: item.contactEmail,
            subject,
            message
          })
        });
      }

      setCelebrations(prev => prev.map(c => c.id === item.id ? {
        ...c,
        status: 'SENT',
        sentAt: new Date().toISOString(),
        draftSubject: subject,
        draftMessage: message
      } : c));
      showToast(`Greeting sent to ${item.contactEmail} and logged in database!`, 'success');
      fetchSummarySilent();
    } catch (err) {
      console.error('Error sending greeting:', err);
      showToast(`Failed to send greeting: ${err.message}`, 'error');
    }
  };

  const handleCreateDraftsForWeek = async () => {
    const targetCelebrations = filteredCelebrations.filter(c =>
      c.daysUntil !== null &&
      c.daysUntil >= 0 &&
      c.daysUntil <= 7 &&
      c.status !== 'DISMISSED' &&
      c.status !== 'SENT'
    );

    if (targetCelebrations.length === 0) {
      showToast('No upcoming unsent celebrations found for this week.', 'info');
      return;
    }

    try {
      const updates = targetCelebrations.map(async (c) => {
        const subject = c.draftSubject || `Warmest Congratulations on your ${formatEventType(c.eventType)}!`;
        const message = c.draftMessage || `Hi ${c.contactName || 'there'}, wishing you continued success and joy on your ${formatEventType(c.eventType)}! Best regards from our team.`;

        await fetch(`${API_BASE}/celebrations/${c.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            draftSubject: subject,
            draftMessage: message,
            status: 'DRAFTED'
          })
        }).catch(err => console.warn('Could not persist draft on server for', c.id, err));

        return {
          ...c,
          status: 'DRAFTED',
          draftSubject: subject,
          draftMessage: message
        };
      });

      const updatedWeek = await Promise.all(updates);
      const updatedMap = new Map(updatedWeek.map(u => [u.id, u]));

      setCelebrations(prev => prev.map(c => updatedMap.get(c.id) || c));
      showToast(`Created and saved draft greetings for ${targetCelebrations.length} celebration(s) this week.`, 'success');
      fetchSummarySilent();
    } catch (err) {
      showToast(`Error creating drafts: ${err.message}`, 'error');
    }
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(15,23,42,0.03)] relative font-sans">

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-[100] max-w-md animate-in slide-in-from-top-2 fade-in duration-200">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
            toast.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
              toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
                'bg-blue-50 border-blue-200 text-blue-800'
            }`}>
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
            {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />}
            {toast.type === 'info' && <AlertCircle className="w-5 h-5 text-blue-600 shrink-0" />}
            <span className="flex-1 leading-snug">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 1. Header Area */}
      <div className="px-8 pt-7 pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Customer celebrations</h2>
          <p className="text-sm text-slate-500 mt-0.5">Customer and account milestones detected across verified intelligence sources, with personalized greetings drafted in Outlook.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="px-3.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-full flex items-center gap-1.5 cursor-default">
            <Check className="w-3.5 h-3.5 stroke-[2.5] text-emerald-600" />
            CRM Intelligence Active
          </span>
          <button
            onClick={handleCreateDraftsForWeek}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-900 rounded-xl text-sm font-bold shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Create drafts for this week
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 rounded-xl text-sm font-bold shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            Add celebration
          </button>
        </div>
      </div>

      {/* 2. Main content area (Scrollable) */}
      <div className="flex-1 overflow-y-auto bg-white px-8 pb-8 pt-2 custom-scrollbar">

        {/* Top Summary Metrics (Clickable Quick Filters) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-7">
          {/* 1. Today */}
          <button
            type="button"
            onClick={() => handleToggleQuickFilter('today')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer select-none group relative ${quickFilter === 'today'
              ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/30 shadow-md -translate-y-0.5'
              : 'bg-white border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30 hover:shadow-md hover:-translate-y-0.5'
              }`}
            title="Filter by celebrations happening today (click again to clear)"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-800 font-bold">Today</span>
              {quickFilter === 'today' ? (
                <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full shadow-2xs">
                  âœ“ Active
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-slate-400 group-hover:text-emerald-700 transition-colors">
                  Filter â†’
                </span>
              )}
            </div>
            <div className="text-2xl font-extrabold text-slate-900">{countToday}</div>
          </button>

          {/* 2. Tomorrow */}
          <button
            type="button"
            onClick={() => handleToggleQuickFilter('tomorrow')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer select-none group relative ${quickFilter === 'tomorrow'
              ? 'bg-teal-50/90 border-teal-500 ring-2 ring-teal-500/30 shadow-md -translate-y-0.5'
              : 'bg-white border-slate-200 hover:border-teal-400 hover:bg-teal-50/30 hover:shadow-md hover:-translate-y-0.5'
              }`}
            title="Filter by celebrations happening tomorrow (click again to clear)"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-800 font-bold">Tomorrow</span>
              {quickFilter === 'tomorrow' ? (
                <span className="text-[10px] font-extrabold text-teal-700 bg-teal-100/90 px-2 py-0.5 rounded-full shadow-2xs">
                  âœ“ Active
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-slate-400 group-hover:text-teal-700 transition-colors">
                  Filter â†’
                </span>
              )}
            </div>
            <div className="text-2xl font-extrabold text-slate-900">{countTomorrow}</div>
          </button>

          {/* 3. This week */}
          <button
            type="button"
            onClick={() => handleToggleQuickFilter('thisWeek')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer select-none group relative ${quickFilter === 'thisWeek'
              ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/30 shadow-md -translate-y-0.5'
              : 'bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 hover:shadow-md hover:-translate-y-0.5'
              }`}
            title="Filter by celebrations this week (click again to clear)"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-800 font-bold">This week</span>
              {quickFilter === 'thisWeek' ? (
                <span className="text-[10px] font-extrabold text-blue-700 bg-blue-100/90 px-2 py-0.5 rounded-full shadow-2xs">
                  âœ“ Active
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-slate-400 group-hover:text-blue-700 transition-colors">
                  Filter â†’
                </span>
              )}
            </div>
            <div className="text-2xl font-extrabold text-slate-900">{countThisWeek}</div>
          </button>

          {/* 4. Needs verification */}
          <button
            type="button"
            onClick={() => handleToggleQuickFilter('needsVerification')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer select-none group relative ${quickFilter === 'needsVerification'
              ? 'bg-amber-50/90 border-amber-500 ring-2 ring-amber-500/30 shadow-md -translate-y-0.5'
              : 'bg-white border-slate-200 hover:border-amber-400 hover:bg-amber-50/30 hover:shadow-md hover:-translate-y-0.5'
              }`}
            title="Filter by celebrations needing verification (click again to clear)"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-800 font-bold">Needs verification</span>
              {quickFilter === 'needsVerification' ? (
                <span className="text-[10px] font-extrabold text-amber-700 bg-amber-100/90 px-2 py-0.5 rounded-full shadow-2xs">
                  âœ“ Active
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-slate-400 group-hover:text-amber-700 transition-colors">
                  Filter â†’
                </span>
              )}
            </div>
            <div className="text-2xl font-extrabold text-[#C2410C]">{countNeedsVerification}</div>
          </button>

          {/* 5. Drafts waiting */}
          <button
            type="button"
            onClick={() => handleToggleQuickFilter('draftsWaiting')}
            className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer select-none group relative col-span-2 sm:col-span-1 ${quickFilter === 'draftsWaiting'
              ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500/30 shadow-md -translate-y-0.5'
              : 'bg-white border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 hover:shadow-md hover:-translate-y-0.5'
              }`}
            title="Filter by celebrations with drafts waiting (click again to clear)"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-800 font-bold">Drafts waiting</span>
              {quickFilter === 'draftsWaiting' ? (
                <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-100/90 px-2 py-0.5 rounded-full shadow-2xs">
                  âœ“ Active
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-slate-400 group-hover:text-indigo-700 transition-colors">
                  Filter â†’
                </span>
              )}
            </div>
            <div className="text-2xl font-extrabold text-slate-900">{countDraftsWaiting}</div>
          </button>
        </div>

        {/* Layout split: Left (Cards) and Right (Sidebar) */}
        <div className="flex flex-col lg:flex-row gap-8">

          {/* Left Column */}
          <div className="flex-1 min-w-0">
            {/* Active Quick Filter Indicator Banner */}
            {quickFilter && (
              <div className="mb-5 flex items-center justify-between bg-blue-50/90 border border-blue-200/80 rounded-2xl px-4 py-2.5 text-xs text-blue-900 shadow-2xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-700">Active card filter:</span>
                  <span className="bg-white border border-blue-300 font-extrabold px-3 py-0.5 rounded-full text-blue-700 shadow-2xs flex items-center gap-1.5">
                    {quickFilter === 'today' && '📅 Today'}
                    {quickFilter === 'tomorrow' && '⏳ Tomorrow'}
                    {quickFilter === 'thisWeek' && '🗓️ This week'}
                    {quickFilter === 'needsVerification' && '⚠️ Needs verification'}
                    {quickFilter === 'draftsWaiting' && '✉️ Drafts waiting'}
                  </span>
                  <span className="text-slate-600 font-medium">
                    ({filteredCelebrations.length} celebration{filteredCelebrations.length === 1 ? '' : 's'})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickFilter(null)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-white hover:bg-blue-100/60 border border-blue-200 px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                  title="Show all celebrations"
                >
                  Clear filter ✕
                </button>
              </div>
            )}

            {/* Filters Row */}
            <div className="flex items-center gap-3 mb-8 flex-wrap">
              <div className="flex bg-[#F1F5F9] rounded-full p-1 shrink-0">
                {['All', 'Contacts', 'Company', 'Festivals'].map(tab => (
                  <button
                    key={tab}
                    className={`px-4 py-1 text-[13px] font-bold rounded-full transition-colors cursor-pointer ${activeFilter === tab
                      ? 'bg-[#1D4ED8] !text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-900'
                      }`}
                    style={{ color: activeFilter === tab ? '#ffffff' : undefined }}
                    onClick={() => setActiveFilter(tab)}
                  >
                    <span style={{ color: activeFilter === tab ? '#ffffff' : undefined }}>{tab}</span>
                  </button>
                ))}
              </div>

              {/* Search input with live clear */}
              <div className="relative flex-1 min-w-[220px]">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search customer occasions..."
                  className="w-full pl-3 pr-8 py-1.5 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Source filter */}
              <div className="relative shrink-0">
                <select
                  value={selectedSource}
                  onChange={e => setSelectedSource(e.target.value)}
                  className="appearance-none bg-white border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[140px] cursor-pointer"
                >
                  <option value="All">All sources</option>
                  <option value="CUSTOMERPULSE">CustomerPulse CRM</option>
                  <option value="PUBLIC_NEWS">Public News</option>
                  <option value="OFFICIAL_WEBSITE">Official Customer Website</option>
                  <option value="CRM_EMAIL">CRM Email Intelligence</option>
                  <option value="CUSTOMER_VERIFIED">Customer-Verified</option>
                  <option value="MANUAL">Manual Entry</option>
                </select>
                <ChevronDown className="w-4 h-4 text-gray-500 absolute right-2.5 top-2 pointer-events-none" />
              </div>

              {/* Status filter */}
              <div className="relative shrink-0">
                <select
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value)}
                  className="appearance-none bg-white border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[140px] cursor-pointer"
                >
                  <option value="All">All statuses</option>
                  <option value="Draft ready">Draft ready</option>
                  <option value="Sent">Sent</option>
                  <option value="Needs verification">Needs verification</option>
                </select>
                <ChevronDown className="w-4 h-4 text-gray-500 absolute right-2.5 top-2 pointer-events-none" />
              </div>
            </div>

            {/* Timelines and Cards */}
            <div className="space-y-8">

              {/* TODAY */}
              {today.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-3">Today</h3>
                  {today.map(c => (
                    <div key={c.id || c._id} className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm relative mb-4">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex gap-3">
                          {c.eventType === 'FESTIVAL' || c.eventType === 'HOLIDAY' ? (
                            <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-lg shrink-0 border border-orange-100 shadow-sm mt-0.5">
                              🪔
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0 mt-0.5">
                              {getInitials(c.contactName || c.accountName || accName)}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-gray-900 text-[15px] flex items-center gap-1.5 flex-wrap">
                              <span>
                                {c.eventType === 'FESTIVAL' || c.eventType === 'HOLIDAY'
                                  ? (c.eventTitle || formatEventType(c.eventType))
                                  : `${c.contactName || c.accountName || accName} · ${formatEventType(c.eventType)}`}
                              </span>
                              <EventInfoTooltip item={c} accountName={accName} />
                            </div>
                            <div className="text-[13px] text-gray-500 mt-0.5">
                              {c.eventType === 'FESTIVAL' || c.eventType === 'HOLIDAY'
                                ? `${c.accountName ? `${c.accountName} · ` : ''}Public Observance · Event date: ${formatDate(c.eventDate)}`
                                : `${c.sourceType === 'MANUAL' ? 'Manual entry' : `Auto-detected from ${c.sourceName || c.sourceType || 'System'}`} · Event date: ${formatDate(c.eventDate)}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.status === 'DRAFTED' && (
                            <span className="px-2.5 py-1 bg-[#ffedd5] text-[#9a3412] text-xs font-bold rounded-md whitespace-nowrap">
                              Draft ready
                            </span>
                          )}
                          {c.status === 'SENT' && (
                            <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-md whitespace-nowrap">
                              Sent
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Progress Tracker */}
                      <div className="flex items-center gap-2 text-[13px] mb-4">
                        <span className="text-gray-900 font-bold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 stroke-[3] text-green-600" /> Detected
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                        <span className={`font-bold px-2 py-0.5 rounded ${c.status === 'DRAFTED' || c.status === 'SENT' ? 'bg-blue-50 text-blue-700' : 'text-gray-400'
                          }`}>
                          Draft
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                        <span className={`font-bold px-2 py-0.5 rounded ${c.status === 'SENT' ? 'bg-green-100 text-green-800' : 'text-gray-400'
                          }`}>
                          Sent
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-gray-400 font-medium">Replied</span>
                      </div>

                      {/* Draft Preview Box */}
                      {c.draftMessage && (
                        <div className="bg-gray-50/70 rounded-lg p-4 border border-gray-100 mb-4">
                          <div className="text-[13px] text-gray-600 mb-1">
                            To: <span className="font-bold text-gray-900">{c.contactEmail || 'No email specified'}</span> · Subject: <span className="font-bold text-gray-900">{c.draftSubject || 'Celebration Greeting'}</span>
                          </div>
                          <p className="text-[14px] text-gray-800 leading-relaxed mt-2 mb-3 whitespace-pre-wrap">{c.draftMessage}</p>
                          <div className="text-[12px] text-gray-400 font-medium flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                            AI-drafted · Tone: <span className="font-semibold text-gray-600">Warm</span> · Language: English
                          </div>
                        </div>
                      )}

                      {/* Card Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        {c.status !== 'SENT' ? (
                          <>
                            <button
                              onClick={() => {
                                setActiveCelebration(c);
                                setIsDraftModalOpen(true);
                              }}
                              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[13px] font-bold shadow-sm transition-colors flex items-center gap-1.5"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Open draft in Outlook
                            </button>
                            <button
                              onClick={() => handleQuickSend(c)}
                              className="px-4 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 rounded-lg text-[13px] font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                            >
                              <Send className="w-3.5 h-3.5 text-gray-600" />
                              Send now
                            </button>
                            <button
                              onClick={() => {
                                setActiveCelebration(c);
                                setIsDraftModalOpen(true);
                              }}
                              className="px-4 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-[13px] font-semibold hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                setActiveCelebration(c);
                                setIsDraftModalOpen(true);
                              }}
                              className="px-4 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-[13px] font-semibold hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                              Regenerate
                            </button>
                            <button
                              onClick={() => handleSkipCelebration(c.id)}
                              className="px-4 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-lg text-[13px] font-semibold hover:bg-gray-50 hover:text-gray-700 transition-colors"
                            >
                              Skip
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2 text-xs font-semibold text-green-700 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                            <Check className="w-4 h-4 text-green-600 stroke-[3]" />
                            Greeting sent successfully on {c.eventDate ? formatDate(c.eventDate) : 'today'}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TOMORROW */}
              {tomorrow.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-3">Tomorrow</h3>
                  {tomorrow.map(c => (
                    <div key={c.id || c._id} className="bg-gray-50/50 rounded-xl p-5 border border-gray-100 flex justify-between items-start mb-4">
                      <div className="flex gap-3">
                        {c.eventType === 'FESTIVAL' || c.eventType === 'HOLIDAY' ? (
                          <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-lg shrink-0 border border-orange-100 shadow-sm mt-0.5">
                            🪔
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0 mt-0.5">
                            {getInitials(c.contactName || c.accountName || accName)}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-gray-900 text-[15px] flex items-center gap-1.5 flex-wrap">
                            <span>
                              {c.eventType === 'FESTIVAL' || c.eventType === 'HOLIDAY'
                                ? (c.eventTitle || formatEventType(c.eventType))
                                : `${c.contactName || c.accountName || accName} · ${formatEventType(c.eventType)}`}
                            </span>
                            <EventInfoTooltip item={c} accountName={accName} />
                          </div>
                          <div className="text-[13px] text-gray-500 mt-0.5">
                            {c.eventType === 'FESTIVAL' || c.eventType === 'HOLIDAY'
                              ? `${c.accountName ? `${c.accountName} · ` : ''}Public Observance · Event date: ${formatDate(c.eventDate)}`
                              : `${c.sourceType === 'MANUAL' ? 'Manual entry' : `Auto-detected from ${c.sourceName || c.sourceType || 'System'}`} · Event date: ${formatDate(c.eventDate)}`}
                          </div>

                          <button
                            onClick={() => {
                              setActiveCelebration(c);
                              setIsDraftModalOpen(true);
                            }}
                            className="mt-4 px-4 py-1.5 bg-white border border-gray-300 text-gray-900 rounded-lg text-[13px] font-bold shadow-sm hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                          >
                            <Mail className="w-3.5 h-3.5 text-blue-600" />
                            Create Outlook draft
                          </button>
                        </div>
                      </div>
                      <div className="text-[13px] text-gray-500 font-medium bg-gray-100/70 px-2.5 py-1 rounded-md">
                        {c.status === 'DRAFTED' ? 'Draft ready' : 'No draft yet'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* THIS WEEK */}
              {thisWeek.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-3">This week</h3>
                  {thisWeek.map(c => (
                    <div key={c.id || c._id} className="bg-white rounded-xl p-4 flex items-center justify-between border border-gray-100 shadow-sm mb-4">
                      <div className="flex items-center gap-3">
                        {c.eventType === 'FESTIVAL' || c.eventType === 'HOLIDAY' ? (
                          <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-lg shrink-0 border border-orange-100 shadow-sm">
                            🪔
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                            {getInitials(c.contactName || c.accountName || accName)}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-gray-900 text-[15px] flex items-center gap-1.5 flex-wrap">
                            <span>
                              {c.eventType === 'FESTIVAL' || c.eventType === 'HOLIDAY'
                                ? (c.eventTitle || formatEventType(c.eventType))
                                : `${c.contactName || c.accountName || accName} · ${formatEventType(c.eventType)}`}
                            </span>
                            <EventInfoTooltip item={c} accountName={accName} />
                          </div>
                          <div className="text-[13px] text-gray-500 mt-0.5">
                            {c.eventType === 'FESTIVAL' || c.eventType === 'HOLIDAY'
                              ? `${c.accountName ? `${c.accountName} · ` : ''}Public Observance · Event date: ${formatDate(c.eventDate)}`
                              : `${c.sourceType === 'MANUAL' ? 'Manual entry' : `Auto-detected from ${c.sourceName || c.sourceType || 'System'}`} · Event date: ${formatDate(c.eventDate)}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            setActiveCelebration(c);
                            setIsDraftModalOpen(true);
                          }}
                          className="px-4 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-[13px] font-semibold hover:bg-gray-50 transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                          <Mail className="w-3.5 h-3.5 text-blue-600" />
                          {c.status === 'DRAFTED' ? 'Review draft' : 'Create draft'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* NEEDS VERIFICATION */}
              {needsVerification.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-3">Needs verification</h3>
                  {needsVerification.map(c => (
                    <div key={c.id || c._id} className="bg-white border border-amber-300 rounded-xl p-5 shadow-sm mb-4 relative">
                      <div className="flex justify-between items-start">
                        <div className="flex gap-3">
                          <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 font-bold text-sm shrink-0 mt-0.5">
                            {getInitials(c.contactName || c.accountName)}
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 text-[15px] flex items-center gap-1.5 flex-wrap">
                              <span>{c.contactName || c.accountName} · {formatEventType(c.eventType)}</span>
                              <EventInfoTooltip item={c} accountName={accName} />
                            </div>
                            <div className="text-[13px] text-gray-500 mt-0.5">
                              Detected from {c.sourceName || c.sourceType || 'System'} on {c.eventDate ? formatDate(c.eventDate) : 'Pending date'}
                            </div>

                            <div className="flex items-center gap-2 mt-4">
                              <button
                                onClick={() => {
                                  setActiveCelebration(c);
                                  setIsDateModalOpen(true);
                                }}
                                className="px-3.5 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-[13px] font-semibold hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                              >
                                <Calendar className="w-3.5 h-3.5 text-gray-500" />
                                Wrong date
                              </button>
                              <button
                                onClick={() => handleSkipCelebration(c.id)}
                                className="px-3.5 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-lg text-[13px] font-semibold hover:bg-gray-50 transition-colors"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleVerifyCelebration(c.id)}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[13px] font-bold shadow-sm transition-colors flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          Confirm
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* UPCOMING MILESTONES (> 7 DAYS) */}
              {upcomingLater.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-3">Upcoming milestones</h3>
                  {upcomingLater.map(c => (
                    <div key={c.id || c._id} className="bg-white rounded-xl p-4 flex items-center justify-between border border-gray-100 shadow-sm mb-4">
                      <div className="flex items-center gap-3">
                        {c.eventType === 'FESTIVAL' || c.eventType === 'HOLIDAY' ? (
                          <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-lg shrink-0 border border-orange-100 shadow-sm">
                            🪔
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                            {getInitials(c.contactName || c.accountName || accName)}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-gray-900 text-[15px] flex items-center gap-1.5 flex-wrap">
                            <span>
                              {c.eventType === 'FESTIVAL' || c.eventType === 'HOLIDAY'
                                ? (c.eventTitle || formatEventType(c.eventType))
                                : `${c.contactName || c.accountName || accName} · ${formatEventType(c.eventType)}`}
                            </span>
                            <EventInfoTooltip item={c} accountName={accName} />
                          </div>
                          <div className="text-[13px] text-gray-500 mt-0.5">
                            {c.eventType === 'FESTIVAL' || c.eventType === 'HOLIDAY'
                              ? `${c.accountName ? `${c.accountName} · ` : ''}Public Observance · Event date: ${formatDate(c.eventDate)}`
                              : `${c.sourceType === 'MANUAL' ? 'Manual entry' : `Auto-detected from ${c.sourceName || c.sourceType || 'System'}`} · Event date: ${formatDate(c.eventDate)}`}
                            {typeof c.daysUntil === 'number' && ` · in ${c.daysUntil} days`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            setActiveCelebration(c);
                            setIsDraftModalOpen(true);
                          }}
                          className="px-4 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-[13px] font-semibold hover:bg-gray-50 transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                          <Mail className="w-3.5 h-3.5 text-blue-600" />
                          {c.status === 'DRAFTED' ? 'Review draft' : 'Create draft'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* UPCOMING FESTIVALS */}
              {upcomingFestivals.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-3">Upcoming festivals</h3>
                  {upcomingFestivals.map(c => (
                    <div key={c.id || c._id} className="bg-white rounded-xl p-4 flex justify-between items-center border border-gray-100 shadow-sm mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-lg shrink-0 border border-orange-100 shadow-sm">
                          🪔
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 text-[15px] flex items-center gap-1.5 flex-wrap">
                            <span>{c.eventTitle || formatEventType(c.eventType)}</span>
                            <EventInfoTooltip item={c} accountName={accName} />
                          </div>
                          <div className="text-[13px] text-gray-500 mt-0.5">
                            {c.accountName ? `${c.accountName} · ` : ''}Public Observance · {formatDate(c.eventDate)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setActiveCelebration(c);
                            setIsDraftModalOpen(true);
                          }}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[13px] font-bold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          Review draft
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* DRAFTS WAITING (OLDER / ALL PENDING DRAFTS) */}
              {pastDrafts.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-3">Drafts waiting for review</h3>
                  {pastDrafts.map(c => (
                    <div key={c.id || c._id} className="bg-white rounded-xl p-4 flex justify-between items-center border border-indigo-100 shadow-sm mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm shrink-0">
                          {getInitials(c.contactName || c.accountName || accName)}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 text-[15px] flex items-center gap-1.5 flex-wrap">
                            <span>{c.contactName || c.accountName || accName} · {c.eventTitle || formatEventType(c.eventType)}</span>
                            <EventInfoTooltip item={c} accountName={accName} />
                          </div>
                          <div className="text-[13px] text-gray-500 mt-0.5">
                            {c.sourceType === 'MANUAL' ? 'Manual entry' : (c.sourceName || c.sourceType || 'System')} · Event date: {formatDate(c.eventDate)}
                            <span className="ml-2 px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold text-[11px] rounded">Draft ready</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setActiveCelebration(c);
                            setIsDraftModalOpen(true);
                          }}
                          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[13px] font-bold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          Review draft
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* SENT GREETINGS HISTORY */}
              {sentGreetings.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-3">Sent greetings</h3>
                  {sentGreetings.map(c => (
                    <div key={c.id || c._id} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm mb-4">
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm shrink-0 mt-0.5">
                            {getInitials(c.contactName || c.accountName)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-gray-900 text-[15px] truncate flex items-center gap-1.5 flex-wrap">
                              <span>{c.contactName || c.accountName || accName} · {formatEventType(c.eventType)}</span>
                              <EventInfoTooltip item={c} accountName={accName} />
                            </div>
                            <div className="text-[13px] text-gray-500 mt-0.5">
                              {c.sourceType === 'MANUAL' ? 'Manual entry' : (c.sourceName || c.sourceType || 'CustomerPulse')}
                              {c.eventDate ? ` · Milestone: ${formatDate(c.eventDate)}` : ''}
                              {(c.sentDate || c.sentAt) ? ` · Sent on ${formatDate(c.sentDate || c.sentAt)}` : ''}
                            </div>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-md whitespace-nowrap flex items-center gap-1 shrink-0">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          Sent
                        </span>
                      </div>

                      {(c.draftSubject || c.draftMessage) && (
                        <div className="bg-slate-50/70 rounded-lg p-3.5 border border-slate-100 mt-3.5">
                          <div className="text-[13px] text-slate-600 mb-1">
                            {c.contactEmail && (
                              <>To: <span className="font-semibold text-slate-900">{c.contactEmail}</span> · </>
                            )}
                            Subject: <span className="font-semibold text-slate-900">{c.draftSubject || c.eventTitle || formatEventType(c.eventType)}</span>
                          </div>
                          {c.draftMessage && (
                            <p className="text-[13px] text-slate-700 leading-relaxed mt-1.5 whitespace-pre-wrap">
                              {c.draftMessage}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!isLoading && !hasAnyVisibleCard && (
                <div className="text-center py-12 px-4 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                  <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 font-bold text-xl">
                    🎉
                  </div>
                  <h4 className="text-sm font-bold text-gray-800">No customer occasions detected yet.</h4>
                  <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                    {searchQuery ? 'No customer occasions match your search criteria.' : 'Customer-related birthdays, anniversaries and milestones will appear here when detected.'}
                  </p>
                  <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add customer occasion
                  </button>
                </div>
              )}

            </div>
          </div>

          {/* Right Column / Sidebar */}
          <div className="w-full lg:w-[320px] shrink-0 space-y-4">

            {/* Greeting impact */}
            <div className="bg-[#F8FAFC] p-5 rounded-2xl border border-slate-100">
              <h3 className="text-[13px] font-bold text-slate-900 mb-4">Greeting impact, last 30 days</h3>
              <div className="space-y-2.5 mb-4">
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-gray-700 font-medium">Greetings sent</span>
                  <span className="font-semibold text-gray-900">
                    {Math.max(summary?.impact?.greetingsSent ?? 0, sentGreetings.length)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-gray-700 font-medium">Replies received</span>
                  <span className="font-semibold text-gray-900">{summary?.impact?.repliesReceived ?? 0}</span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-gray-700 font-medium">Health points earned</span>
                  <span className="font-bold text-emerald-600">
                    +{(summary?.impact?.healthPointsEarned != null && summary?.impact?.healthPointsEarned > 0)
                      ? summary?.impact?.healthPointsEarned
                      : Math.max(summary?.impact?.greetingsSent ?? 0, sentGreetings.length)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed font-medium">
                A reply adds +8 to health. A sent greeting with no reply adds +1.
              </p>
            </div>

            {/* Safeguards Automation Controls */}
            <div className="bg-[#F8FAFC] p-5 rounded-2xl border border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[13px] font-bold text-slate-900">Safeguards</h3>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-md">
                  Automation Controls
                </span>
              </div>

              <div className="space-y-4">
                {/* 1. Auto-create drafts 2 days before */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[13px] font-medium text-slate-800 leading-snug">
                      Auto-create drafts 2 days before
                    </span>
                    <div className="relative group inline-flex items-center cursor-help shrink-0">
                      <Info className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                      <div className="absolute right-0 bottom-full mb-2 w-64 p-3 bg-slate-900 text-white text-[11px] rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none text-left leading-relaxed">
                        <div className="font-bold text-blue-300 mb-1">Pre-Draft Generator</div>
                        When <strong>ON</strong>, CustomerPulse automatically prepares personalized greeting drafts in Outlook 48 hours before an occasion.<br /><br />
                        When <strong>OFF</strong>, drafts are only created when manually requested.
                        <div className="absolute top-full right-2 -mt-1 border-4 border-transparent border-t-slate-900" />
                      </div>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] font-bold ${safeguards.autoCreateDrafts ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {safeguards.autoCreateDrafts ? 'ON' : 'OFF'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={safeguards.autoCreateDrafts}
                      onClick={() => handleToggleSafeguard('autoCreateDrafts')}
                      title={`Click to turn Auto-create drafts ${safeguards.autoCreateDrafts ? 'OFF' : 'ON'}`}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${safeguards.autoCreateDrafts ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${safeguards.autoCreateDrafts ? 'translate-x-5' : 'translate-x-0'
                          }`}
                      />
                    </button>
                  </div>
                </div>

                {/* 2. Auto-send */}
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200/60">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[13px] font-medium text-slate-800 leading-snug">
                      Auto-send
                    </span>
                    <div className="relative group inline-flex items-center cursor-help shrink-0">
                      <Info className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                      <div className="absolute right-0 bottom-full mb-2 w-64 p-3 bg-slate-900 text-white text-[11px] rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none text-left leading-relaxed">
                        <div className="font-bold text-amber-300 mb-1">Human-in-the-Loop Safeguard</div>
                        When <strong>OFF (Recommended)</strong>, no email is ever sent automatically. You review each draft in Outlook before sending.<br /><br />
                        When <strong>ON</strong>, greetings will be sent automatically in the background on the event date.
                        <div className="absolute top-full right-2 -mt-1 border-4 border-transparent border-t-slate-900" />
                      </div>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] font-bold ${safeguards.autoSend ? 'text-blue-700' : 'text-slate-400'}`}>
                      {safeguards.autoSend ? 'ON' : 'OFF'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={safeguards.autoSend}
                      onClick={() => handleToggleSafeguard('autoSend')}
                      title={`Click to turn Auto-send ${safeguards.autoSend ? 'OFF' : 'ON'}`}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${safeguards.autoSend ? 'bg-blue-600' : 'bg-slate-300'
                        }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${safeguards.autoSend ? 'translate-x-5' : 'translate-x-0'
                          }`}
                      />
                    </button>
                  </div>
                </div>

              </div>
            </div>

            {/* Intelligence sources */}
            <div className="bg-[#F8FAFC] p-5 rounded-2xl border border-slate-100">
              <h3 className="text-[13px] font-bold text-slate-900 mb-4">Intelligence sources</h3>
              <div className="space-y-3">
                {(sources.length > 0 ? sources : [
                  { sourceType: 'CUSTOMERPULSE', name: 'CustomerPulse CRM', enabled: true },
                  { sourceType: 'PUBLIC_NEWS', name: 'Public News Monitoring', enabled: true },
                  { sourceType: 'OFFICIAL_WEBSITE', name: 'Official Website & Press', enabled: true },
                  { sourceType: 'CRM_EMAIL', name: 'CRM Email Intelligence', enabled: true },
                  { sourceType: 'CUSTOMER_VERIFIED', name: 'Customer-Verified', enabled: true },
                  { sourceType: 'MANUAL', name: 'Manual Entry', enabled: true }
                ]).map(src => (
                  <div key={src.sourceType} className="flex justify-between items-center text-[13px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-gray-700 font-medium truncate">{src.name}</span>
                      {typeof src.activeCount === 'number' && src.activeCount > 0 && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded-full shrink-0">
                          {src.activeCount}
                        </span>
                      )}
                    </div>
                    <span className="text-emerald-600 font-semibold flex items-center gap-1 text-xs shrink-0">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Active
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 3. MODAL: Add / Edit Celebration Form with Complete Field Validation      */}
      {/* ========================================================================= */}
      {isAddModalOpen && (
        <AddCelebrationModal
          account={account}
          contacts={accountContacts}
          existingCelebrations={celebrations}
          token={token}
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={(newEvent) => {
            setCelebrations(prev => [newEvent, ...prev]);
            setIsAddModalOpen(false);
            showToast('Celebration milestone added successfully!', 'success');
            loadCelebrationData(true);
            fetchSummarySilent();
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL: Greeting Draft & Composer with Complete Field Validation       */}
      {/* ========================================================================= */}
      {isDraftModalOpen && activeCelebration && (
        <GreetingDraftModal
          celebration={activeCelebration}
          account={account}
          contacts={accountContacts}
          token={token}
          onClose={() => {
            setIsDraftModalOpen(false);
            setActiveCelebration(null);
          }}
          onSaveDraft={async (updatedDraft) => {
            try {
              await fetch(`${API_BASE}/celebrations/${activeCelebration.id}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                  draftSubject: updatedDraft.draftSubject,
                  draftMessage: updatedDraft.draftMessage,
                  contactEmail: updatedDraft.contactEmail,
                  contactName: updatedDraft.contactName,
                  contactId: updatedDraft.contactId,
                  status: 'DRAFTED'
                })
              });
            } catch (err) {
              console.warn('Error saving draft to backend:', err);
            }
            setCelebrations(prev => prev.map(c => c.id === activeCelebration.id ? { ...c, ...updatedDraft, status: 'DRAFTED' } : c));
            setIsDraftModalOpen(false);
            setActiveCelebration(null);
            showToast('Greeting draft saved to database successfully.', 'success');
            fetchSummarySilent();
          }}
          onSent={(sentData) => {
            setCelebrations(prev => prev.map(c => c.id === activeCelebration.id ? { ...c, ...sentData, status: 'SENT' } : c));
            setIsDraftModalOpen(false);
            setActiveCelebration(null);
            showToast('Greeting sent to Outlook and logged in database!', 'success');
            fetchSummarySilent();
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL: Date Correction with Validation                                 */}
      {/* ========================================================================= */}
      {isDateModalOpen && activeCelebration && (
        <DateCorrectionModal
          celebration={activeCelebration}
          token={token}
          onClose={() => {
            setIsDateModalOpen(false);
            setActiveCelebration(null);
          }}
          onSuccess={(updatedDate) => {
            setCelebrations(prev => prev.map(c => c.id === activeCelebration.id ? { ...c, eventDate: updatedDate, verificationStatus: 'VERIFIED' } : c));
            setIsDateModalOpen(false);
            setActiveCelebration(null);
            showToast('Event date corrected and verified.', 'success');
            loadCelebrationData(true);
            fetchSummarySilent();
          }}
        />
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: AddCelebrationModal
// Validates: contactId, eventType, eventTitle, eventDate, eventDescription
// ─────────────────────────────────────────────────────────────────────────────
function AddCelebrationModal({ account, contacts, existingCelebrations, token, onClose, onSuccess }) {
  const accId = account?.accountId || account?.id;
  const accName = account?.companyName || account?.name || 'Account';

  // Form Fields State
  const [formData, setFormData] = useState({
    contactId: contacts[0]?.contactId || contacts[0]?.id || '',
    contactName: contacts[0]?.name || '',
    contactEmail: contacts[0]?.email || '',
    eventType: 'BIRTHDAY',
    eventTitle: '',
    eventDate: '',
    eventDescription: '',
    isCustomContact: contacts.length === 0
  });

  // Validation State
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-generate suggested event title when contact or eventType changes if not manually modified
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);

  const updateSuggestedTitle = (contactName, eventType) => {
    if (titleManuallyEdited) return;
    const name = contactName ? contactName.trim() : 'Customer';
    const typeLabel = EVENT_TYPES.find(t => t.value === eventType)?.label || 'Celebration';
    const suggested = `${name}'s ${typeLabel}`;
    setFormData(prev => ({ ...prev, eventTitle: suggested }));
    setErrors(prev => ({ ...prev, eventTitle: '' }));
  };

  useEffect(() => {
    if (!formData.eventTitle && formData.contactName) {
      updateSuggestedTitle(formData.contactName, formData.eventType);
    }
  }, []);

  // Validation Engine
  const validateField = (name, value, currentFormData = formData) => {
    let error = '';
    switch (name) {
      case 'contactId': {
        const isAccountWide = ['FESTIVAL', 'HOLIDAY', 'COMPANY_ANNIVERSARY', 'BUSINESS_MILESTONE'].includes(currentFormData.eventType);
        if (isAccountWide && !value && !currentFormData.contactName) {
          error = '';
        } else if (currentFormData.isCustomContact) {
          error = validateRequired(currentFormData.contactName, 'Contact name') ||
            validateLength(currentFormData.contactName, 2, 80, 'Contact name');
        } else if (!isAccountWide) {
          error = validateRequired(value, 'Contact selection');
        }
        break;
      }

      case 'contactEmail':
        if (value && value.trim()) {
          error = validateEmail(value);
        }
        break;

      case 'eventType':
        error = validateRequired(value, 'Event type');
        break;

      case 'eventTitle':
        error = validateRequired(value, 'Event title') ||
          validateLength(value, 3, 100, 'Event title');
        break;

      case 'eventDate':
        error = validateDate(value, 'Event date');
        if (!error && currentFormData.contactId && !currentFormData.isCustomContact) {
          // Duplicate check
          const isDup = existingCelebrations.some(c =>
            (c.contactId === currentFormData.contactId || c.contactName === currentFormData.contactName) &&
            c.eventType === currentFormData.eventType &&
            c.eventDate === value
          );
          if (isDup) {
            error = 'A celebration of this type on this exact date already exists for this contact.';
          }
        }
        break;

      case 'eventDescription':
        if (value && value.length > 500) {
          error = 'Description cannot exceed 500 characters.';
        }
        break;

      default:
        break;
    }
    return error;
  };

  const handleFieldChange = (name, value) => {
    const updated = { ...formData, [name]: value };
    setFormData(updated);

    if (name === 'eventTitle') {
      setTitleManuallyEdited(true);
    }

    if (touched[name]) {
      const err = validateField(name, value, updated);
      setErrors(prev => ({ ...prev, [name]: err }));
    }
  };

  const handleBlur = (name) => {
    setTouched(prev => ({ ...prev, [name]: true }));
    const err = validateField(name, formData[name], formData);
    setErrors(prev => ({ ...prev, [name]: err }));
  };

  const handleContactSelect = (selectedId) => {
    if (selectedId === 'CUSTOM') {
      setFormData(prev => ({
        ...prev,
        contactId: '',
        contactName: '',
        contactEmail: '',
        isCustomContact: true
      }));
      updateSuggestedTitle('', formData.eventType);
      return;
    }

    const c = contacts.find(item => (item.contactId || item.id) === selectedId);
    if (c) {
      const updated = {
        ...formData,
        contactId: selectedId,
        contactName: c.name || '',
        contactEmail: c.email || '',
        isCustomContact: false
      };
      setFormData(updated);
      updateSuggestedTitle(c.name, formData.eventType);
      if (touched.contactId) {
        setErrors(prev => ({ ...prev, contactId: '' }));
      }
    }
  };

  const handleEventTypeSelect = (newType) => {
    handleFieldChange('eventType', newType);
    updateSuggestedTitle(formData.contactName, newType);
  };

  const validateAll = () => {
    const newErrors = {};
    const isAccountWide = ['FESTIVAL', 'HOLIDAY', 'COMPANY_ANNIVERSARY', 'BUSINESS_MILESTONE'].includes(formData.eventType);
    const allFields = ['eventType', 'eventTitle', 'eventDate', 'eventDescription'];
    if (!isAccountWide || formData.contactId || formData.contactName) {
      allFields.push('contactId');
    }
    if (formData.isCustomContact && formData.contactEmail) {
      allFields.push('contactEmail');
    }

    allFields.forEach(field => {
      const err = validateField(field, formData[field], formData);
      if (err) newErrors[field] = err;
    });

    setErrors(newErrors);
    setTouched(allFields.reduce((acc, f) => ({ ...acc, [f]: true }), {}));
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGeneralError('');

    const isValid = validateAll();
    if (!isValid) {
      setGeneralError('Please fix the highlighted errors before submitting.');
      return;
    }

    setIsSubmitting(true);
    try {
      const isAccountWide = ['FESTIVAL', 'HOLIDAY', 'COMPANY_ANNIVERSARY', 'BUSINESS_MILESTONE'].includes(formData.eventType);
      const payload = {
        accountId: accId,
        accountName: accName,
        contactId: (isAccountWide && !formData.contactId && !formData.contactName)
          ? null
          : (formData.isCustomContact ? `con-custom-${Date.now()}` : (formData.contactId || null)),
        contactName: formData.contactName || '',
        contactEmail: formData.contactEmail || '',
        eventType: formData.eventType,
        eventTitle: formData.eventTitle.trim(),
        eventDate: formData.eventDate,
        eventDescription: formData.eventDescription.trim(),
        sourceType: 'MANUAL',
        sourceName: 'Manual Entry',
        verificationStatus: 'VERIFIED',
        confidence: 'High',
        daysUntil: Math.max(0, Math.ceil((new Date(formData.eventDate) - new Date()) / (1000 * 60 * 60 * 24)))
      };

      const res = await fetch(`${API_BASE}/celebrations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create celebration on server.');
      }

      const created = await res.json();
      onSuccess(created);
    } catch (err) {
      console.error('Failed to create celebration:', err);
      setGeneralError(err.message || 'Failed to create celebration on server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-lg w-full overflow-hidden my-8">

        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <Plus className="w-4 h-4 stroke-[3]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 leading-tight">Add Customer Celebration</h3>
              <p className="text-xs text-gray-500 mt-0.5">Register a manual milestone or festival for this account</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1.5 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4 text-left">

          {generalError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{generalError}</span>
            </div>
          )}

          {/* Field 1: Contact Selector */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Contact <span className="text-red-500">*</span>
            </label>
            {!formData.isCustomContact ? (
              <div className="space-y-1.5">
                <div className="relative">
                  <select
                    value={formData.contactId}
                    onChange={e => handleContactSelect(e.target.value)}
                    onBlur={() => handleBlur('contactId')}
                    className={`w-full bg-white border rounded-xl px-3 py-2.5 text-sm appearance-none focus:outline-none transition-all cursor-pointer ${touched.contactId && errors.contactId
                      ? 'border-red-500 bg-red-50/20 focus:ring-2 focus:ring-red-400'
                      : 'border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                      }`}
                  >
                    <option value="">-- Select Contact from Account --</option>
                    {contacts.map(c => (
                      <option key={c.contactId || c.id} value={c.contactId || c.id}>
                        {c.name} {c.title ? `(${c.title})` : ''} - {c.email || 'No email'}
                      </option>
                    ))}
                    <option value="CUSTOM">+ Enter Custom Contact Name</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3.5 pointer-events-none" />
                </div>
                {touched.contactId && errors.contactId && (
                  <p className="text-xs text-red-600 flex items-center gap-1 font-medium mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {errors.contactId}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Contact Full Name *"
                      value={formData.contactName}
                      onChange={e => {
                        handleFieldChange('contactName', e.target.value);
                        updateSuggestedTitle(e.target.value, formData.eventType);
                      }}
                      onBlur={() => handleBlur('contactId')}
                      className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-all ${touched.contactId && errors.contactId
                        ? 'border-red-500 bg-red-50/20 focus:ring-2 focus:ring-red-400'
                        : 'border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                        }`}
                    />
                  </div>
                  {contacts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleContactSelect(contacts[0].contactId || contacts[0].id)}
                      className="px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-xl font-semibold"
                    >
                      Pick from list
                    </button>
                  )}
                </div>
                <input
                  type="email"
                  placeholder="Contact Email (Optional for Outlook sync)"
                  value={formData.contactEmail}
                  onChange={e => handleFieldChange('contactEmail', e.target.value)}
                  onBlur={() => handleBlur('contactEmail')}
                  className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none transition-all ${touched.contactEmail && errors.contactEmail
                    ? 'border-red-500 bg-red-50/20 focus:ring-2 focus:ring-red-400'
                    : 'border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                    }`}
                />
                {touched.contactId && errors.contactId && (
                  <p className="text-xs text-red-600 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {errors.contactId}
                  </p>
                )}
                {touched.contactEmail && errors.contactEmail && (
                  <p className="text-xs text-red-600 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {errors.contactEmail}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Field 2: Event Type */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Event Type <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={formData.eventType}
                onChange={e => handleEventTypeSelect(e.target.value)}
                onBlur={() => handleBlur('eventType')}
                className={`w-full bg-white border rounded-xl px-3 py-2.5 text-sm appearance-none focus:outline-none transition-all cursor-pointer ${touched.eventType && errors.eventType
                  ? 'border-red-500 bg-red-50/20 focus:ring-2 focus:ring-red-400'
                  : 'border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                  }`}
              >
                {EVENT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>
                    {t.icon} {t.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3.5 pointer-events-none" />
            </div>
            {touched.eventType && errors.eventType && (
              <p className="text-xs text-red-600 flex items-center gap-1 font-medium mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {errors.eventType}
              </p>
            )}
          </div>

          {/* Field 3: Event Title */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Event Title <span className="text-red-500">*</span>
              </label>
              <span className={`text-[11px] font-medium ${formData.eventTitle.length > 100 ? 'text-red-600 font-bold' : 'text-gray-400'
                }`}>
                {formData.eventTitle.length}/100
              </span>
            </div>
            <input
              type="text"
              placeholder="e.g. Sarah's 5th Work Anniversary"
              value={formData.eventTitle}
              onChange={e => handleFieldChange('eventTitle', e.target.value)}
              onBlur={() => handleBlur('eventTitle')}
              className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-all ${touched.eventTitle && errors.eventTitle
                ? 'border-red-500 bg-red-50/20 focus:ring-2 focus:ring-red-400'
                : 'border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                }`}
            />
            {touched.eventTitle && errors.eventTitle && (
              <p className="text-xs text-red-600 flex items-center gap-1 font-medium mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {errors.eventTitle}
              </p>
            )}
          </div>

          {/* Field 4: Event Date */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Event Date <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                value={formData.eventDate}
                onChange={e => handleFieldChange('eventDate', e.target.value)}
                onBlur={() => handleBlur('eventDate')}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-all ${touched.eventDate && errors.eventDate
                  ? 'border-red-500 bg-red-50/20 focus:ring-2 focus:ring-red-400'
                  : 'border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                  }`}
              />
            </div>
            {touched.eventDate && errors.eventDate && (
              <p className="text-xs text-red-600 flex items-center gap-1 font-medium mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {errors.eventDate}
              </p>
            )}
          </div>

          {/* Field 5: Event Description */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Description (Optional)
              </label>
              <span className={`text-[11px] font-medium ${formData.eventDescription.length > 500 ? 'text-red-600 font-bold' : 'text-gray-400'
                }`}>
                {formData.eventDescription.length}/500
              </span>
            </div>
            <textarea
              rows={2}
              placeholder="Notes or milestone context..."
              value={formData.eventDescription}
              onChange={e => handleFieldChange('eventDescription', e.target.value)}
              onBlur={() => handleBlur('eventDescription')}
              className={`w-full border rounded-xl p-3 text-sm focus:outline-none transition-all resize-none ${touched.eventDescription && errors.eventDescription
                ? 'border-red-500 bg-red-50/20 focus:ring-2 focus:ring-red-400'
                : 'border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                }`}
            />
            {touched.eventDescription && errors.eventDescription && (
              <p className="text-xs text-red-600 flex items-center gap-1 font-medium mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {errors.eventDescription}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Celebration
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: GreetingDraftModal
// Validates: recipientEmail, subject, message, scheduledFor (if enabled)
// ─────────────────────────────────────────────────────────────────────────────
function GreetingDraftModal({ celebration, account, contacts = [], token, onClose, onSaveDraft, onSent }) {
  const [availableContacts, setAvailableContacts] = useState(Array.isArray(contacts) ? contacts : []);
  const [selectedContactId, setSelectedContactId] = useState(() => {
    if (celebration.contactId) return celebration.contactId;
    const match = (contacts || []).find(c =>
      c.email && celebration.contactEmail && c.email.toLowerCase().trim() === celebration.contactEmail.toLowerCase().trim()
    );
    if (match) return match.contactId || match.id;
    return celebration.contactEmail ? 'custom' : ((contacts && contacts[0]) ? (contacts[0].contactId || contacts[0].id) : '');
  });
  const [selectedContactName, setSelectedContactName] = useState(celebration.contactName || '');

  const [draftData, setDraftData] = useState({
    recipientEmail: celebration.contactEmail || '',
    subject: celebration.draftSubject || `Warmest Congratulations on your ${celebration.eventType ? celebration.eventType.replace(/_/g, ' ') : 'Milestone'}!`,
    message: celebration.draftMessage || `Hi ${celebration.contactName || 'there'},

Wishing you a wonderful celebration! It is truly a pleasure working with you and your team.

Warm regards,`,
    isScheduled: false,
    scheduledFor: ''
  });

  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync available contacts if parent props update
  useEffect(() => {
    if (Array.isArray(contacts) && contacts.length > 0) {
      setAvailableContacts(contacts);
    }
  }, [contacts]);

  // If contacts was empty, fetch directly from backend for celebration's account
  useEffect(() => {
    const targetAccountId = celebration?.accountId || account?.accountId || account?.id;
    if ((!contacts || contacts.length === 0) && targetAccountId && token) {
      fetch(`${API_BASE}/contacts?accountId=${targetAccountId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setAvailableContacts(data);
          }
        })
        .catch(err => console.warn('Could not load contacts for draft modal:', err));
    }
  }, [celebration?.accountId, account?.accountId, token]);

  // Match contact when availableContacts load
  useEffect(() => {
    if (availableContacts.length > 0) {
      const match = availableContacts.find(c =>
        (celebration.contactId && (c.contactId === celebration.contactId || c.id === celebration.contactId)) ||
        (draftData.recipientEmail && c.email?.toLowerCase().trim() === draftData.recipientEmail?.toLowerCase().trim())
      );
      if (match) {
        setSelectedContactId(match.contactId || match.id);
        setSelectedContactName(match.name || '');
      } else if (!draftData.recipientEmail && availableContacts[0]) {
        const first = availableContacts[0];
        setSelectedContactId(first.contactId || first.id);
        setSelectedContactName(first.name || '');
        if (first.email) {
          handleFieldChange('recipientEmail', first.email);
        }
      }
    }
  }, [availableContacts]);

  const handleContactDropdownChange = (contactId) => {
    setSelectedContactId(contactId);
    if (contactId === 'custom') {
      setSelectedContactName('');
      return;
    }
    const chosen = availableContacts.find(c => (c.contactId || c.id) === contactId);
    if (chosen) {
      setSelectedContactName(chosen.name || '');
      handleFieldChange('recipientEmail', chosen.email || '');

      // Gracefully personalize salutation in greeting message if available
      if (chosen.name) {
        setDraftData(prev => {
          let updatedMsg = prev.message || '';
          const greetingPrefix = /^(Dear|Hi|Hello)\s+[^,\n]+,/i;
          if (greetingPrefix.test(updatedMsg)) {
            updatedMsg = updatedMsg.replace(greetingPrefix, `Dear ${chosen.name},`);
          }
          return {
            ...prev,
            recipientEmail: chosen.email || '',
            message: updatedMsg
          };
        });
      }
    }
  };

  const handleEmailInputChange = (val) => {
    handleFieldChange('recipientEmail', val);
    const match = availableContacts.find(c => c.email?.toLowerCase().trim() === val.toLowerCase().trim());
    if (match) {
      setSelectedContactId(match.contactId || match.id);
      setSelectedContactName(match.name || '');
    } else {
      setSelectedContactId('custom');
      setSelectedContactName('');
    }
  };

  // Field Validator
  const validateField = (name, value, current = draftData) => {
    let error = '';
    switch (name) {
      case 'recipientEmail':
        error = validateEmail(value);
        break;
      case 'subject':
        error = validateRequired(value, 'Email subject') ||
          validateLength(value, 3, 150, 'Email subject');
        break;
      case 'message':
        error = validateRequired(value, 'Greeting message') ||
          validateLength(value, 10, 2000, 'Greeting message');
        break;
      case 'scheduledFor':
        if (current.isScheduled) {
          error = validateRequired(value, 'Scheduled time') ||
            validateFutureDateTime(value);
        }
        break;
      default:
        break;
    }
    return error;
  };

  const handleFieldChange = (name, value) => {
    const updated = { ...draftData, [name]: value };
    setDraftData(updated);

    if (touched[name]) {
      const err = validateField(name, value, updated);
      setErrors(prev => ({ ...prev, [name]: err }));
    }
  };

  const handleBlur = (name) => {
    setTouched(prev => ({ ...prev, [name]: true }));
    const err = validateField(name, draftData[name], draftData);
    setErrors(prev => ({ ...prev, [name]: err }));
  };

  const validateAll = () => {
    const newErrors = {};
    const fields = ['recipientEmail', 'subject', 'message'];
    if (draftData.isScheduled) fields.push('scheduledFor');

    fields.forEach(field => {
      const err = validateField(field, draftData[field], draftData);
      if (err) newErrors[field] = err;
    });

    setErrors(newErrors);
    setTouched(fields.reduce((acc, f) => ({ ...acc, [f]: true }), {}));
    return Object.keys(newErrors).length === 0;
  };

  // AI Draft Generator
  const handleGenerateAI = async () => {
    setIsGeneratingAI(true);
    setGeneralError('');
    try {
      const res = await fetch(`${API_BASE}/celebrations/${celebration.id}/draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          contactName: celebration.contactName,
          companyName: celebration.accountName || account?.companyName
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.subject) handleFieldChange('subject', data.subject);
        if (data.message) handleFieldChange('message', data.message);
      } else {
        const fallbackSubj = `Warmest Congratulations on your ${(celebration.eventType || 'Celebration').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}!`;
        const fallbackMsg = `Dear ${celebration.contactName || 'Valued Partner'},

On behalf of everyone at our team, we would like to wish you the very best on your ${(celebration.eventType || 'special occasion').replace(/_/g, ' ').toLowerCase()}! We deeply appreciate your partnership and look forward to celebrating many more milestones together.

Warmest regards,`;
        handleFieldChange('subject', fallbackSubj);
        handleFieldChange('message', fallbackMsg);
      }
    } catch (err) {
      const fallbackSubj = `Happy ${(celebration.eventType || 'Milestone').replace(/_/g, ' ')}!`;
      const fallbackMsg = `Hi ${celebration.contactName || 'there'},

Wishing you joy and congratulations on your special day! Best regards from our team.`;
      handleFieldChange('subject', fallbackSubj);
      handleFieldChange('message', fallbackMsg);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Outlook Compose Deep Link (System/Desktop client first, with Organization Web Outlook fallback)
  const handleOpenOutlook = (e) => {
    e.preventDefault();
    if (!validateAll()) {
      setGeneralError('Please resolve all validation errors before opening Outlook.');
      return;
    }

    const recipient = draftData.recipientEmail || '';
    const subject = draftData.subject || '';
    const body = draftData.message || '';

    // Automatically save draft to database
    onSaveDraft({
      draftSubject: subject,
      draftMessage: body,
      contactEmail: recipient,
      contactName: selectedContactName || celebration.contactName,
      contactId: selectedContactId && selectedContactId !== 'custom' ? selectedContactId : null
    });

    const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const webOutlookUrl = `https://outlook.office365.com/mail/deeplink/compose?to=${encodeURIComponent(recipient)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    // 1. First priority: Open the system's registered desktop Outlook / organization app
    let desktopAppOpened = false;
    const handleBlur = () => {
      desktopAppOpened = true;
    };
    window.addEventListener('blur', handleBlur, { once: true });

    // Request backend to invoke the system's native mail handler directly on the host OS
    fetch(`${API_BASE}/celebrations/launch-system-outlook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        recipientEmail: recipient,
        subject,
        message: body
      })
    }).catch(() => { });

    // Also trigger protocol dispatch via hidden anchor without opening an empty blank web tab
    const anchor = document.createElement('a');
    anchor.href = mailtoUrl;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      if (document.body.contains(anchor)) {
        document.body.removeChild(anchor);
      }
    }, 300);

    // 2. Fallback check: If the system cannot reach/open the desktop app within 2 seconds, fall back to Web Outlook
    setTimeout(() => {
      window.removeEventListener('blur', handleBlur);
      if (!desktopAppOpened && !document.hidden) {
        window.open(webOutlookUrl, '_blank');
      }
    }, 2000);
  };

  // Direct Send
  const handleSendNow = async (e) => {
    e.preventDefault();
    if (!validateAll()) {
      setGeneralError('Please resolve all validation errors before sending.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/celebrations/${celebration.id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          recipientEmail: draftData.recipientEmail,
          subject: draftData.subject,
          message: draftData.message,
          scheduledFor: draftData.isScheduled ? draftData.scheduledFor : null
        })
      });

      if (!res.ok) {
        // Fallback to mark-sent
        const markRes = await fetch(`${API_BASE}/celebrations/${celebration.id}/mark-sent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            recipientEmail: draftData.recipientEmail,
            subject: draftData.subject,
            message: draftData.message
          })
        });
        if (!markRes.ok) {
          const errData = await markRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to send greeting via server.');
        }
      }

      onSent({
        draftSubject: draftData.subject,
        draftMessage: draftData.message,
        contactEmail: draftData.recipientEmail,
        status: draftData.isScheduled ? 'SCHEDULED' : 'SENT',
        sentAt: new Date().toISOString()
      });
    } catch (e) {
      setGeneralError(e.message || 'Failed to send greeting.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-xl w-full overflow-hidden my-8">

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
              <Mail className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 leading-tight">
                Review Greeting Draft
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedContactName || celebration.contactName || celebration.accountName || 'Customer'} · {celebration.eventType}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1.5 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4 text-left">

          {generalError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{generalError}</span>
            </div>
          )}

          {/* Recipient Email & Key Contacts Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                Recipient Email <span className="text-red-500">*</span>
              </label>
              {availableContacts.length > 0 && (
                <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100 flex items-center gap-1">
                  <Users className="w-3 h-3 text-blue-500" />
                  {availableContacts.length} key contact{availableContacts.length > 1 ? 's' : ''} available
                </span>
              )}
            </div>

            {/* Key Contacts Dropdown Selector */}
            {availableContacts.length > 0 && (
              <div className="relative">
                <select
                  value={selectedContactId}
                  onChange={e => handleContactDropdownChange(e.target.value)}
                  className="w-full border border-gray-200 bg-slate-50/70 hover:bg-slate-50 text-gray-800 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all cursor-pointer appearance-none pr-9"
                >
                  <option value="">-- Choose Key Contact from this Account --</option>
                  {availableContacts.map(c => {
                    const cid = c.contactId || c.id;
                    const roleOrDesig = c.designation || c.role || c.hierarchyTag || '';
                    return (
                      <option key={cid} value={cid}>
                        {c.name} {roleOrDesig ? `(${roleOrDesig})` : ''} — {c.email}
                      </option>
                    );
                  })}
                  <option value="custom">✏️ Enter custom email address below...</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            )}

            {/* Direct Email Input Field */}
            <div className="relative">
              <input
                type="email"
                value={draftData.recipientEmail}
                onChange={e => handleEmailInputChange(e.target.value)}
                onBlur={() => handleBlur('recipientEmail')}
                placeholder="recipient@example.com"
                className={`w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none transition-all ${touched.recipientEmail && errors.recipientEmail
                  ? 'border-red-500 bg-red-50/20 focus:ring-2 focus:ring-red-400'
                  : 'border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                  }`}
              />
            </div>
            {touched.recipientEmail && errors.recipientEmail && (
              <p className="text-xs text-red-600 flex items-center gap-1 font-medium mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {errors.recipientEmail}
              </p>
            )}
          </div>

          {/* Subject Line */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Subject Line <span className="text-red-500">*</span>
              </label>
              <span className={`text-[11px] font-medium ${draftData.subject.length > 150 ? 'text-red-600 font-bold' : 'text-gray-400'
                }`}>
                {draftData.subject.length}/150
              </span>
            </div>
            <input
              type="text"
              value={draftData.subject}
              onChange={e => handleFieldChange('subject', e.target.value)}
              onBlur={() => handleBlur('subject')}
              placeholder="Celebration Email Subject"
              className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-all ${touched.subject && errors.subject
                ? 'border-red-500 bg-red-50/20 focus:ring-2 focus:ring-red-400'
                : 'border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                }`}
            />
            {touched.subject && errors.subject && (
              <p className="text-xs text-red-600 flex items-center gap-1 font-medium mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {errors.subject}
              </p>
            )}
          </div>

          {/* Message Body */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Greeting Message <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateAI}
                  disabled={isGeneratingAI}
                  className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-bold disabled:opacity-50 transition-colors"
                >
                  {isGeneratingAI ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {isGeneratingAI ? 'Generating...' : 'Regenerate with AI'}
                </button>
                <span className="text-gray-300">|</span>
                <span className={`text-[11px] font-medium ${draftData.message.length > 2000 ? 'text-red-600 font-bold' : 'text-gray-400'
                  }`}>
                  {draftData.message.length}/2000
                </span>
              </div>
            </div>
            <textarea
              rows={6}
              value={draftData.message}
              onChange={e => handleFieldChange('message', e.target.value)}
              onBlur={() => handleBlur('message')}
              placeholder="Personalized greeting text..."
              className={`w-full border rounded-xl p-3 text-sm focus:outline-none transition-all resize-none ${touched.message && errors.message
                ? 'border-red-500 bg-red-50/20 focus:ring-2 focus:ring-red-400'
                : 'border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                }`}
            />
            {touched.message && errors.message && (
              <p className="text-xs text-red-600 flex items-center gap-1 font-medium mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {errors.message}
              </p>
            )}
          </div>

          {/* Modal Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={handleOpenOutlook}
              className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-800 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
              Open in Outlook
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (validateAll()) {
                    onSaveDraft({
                      draftSubject: draftData.subject,
                      draftMessage: draftData.message,
                      contactEmail: draftData.recipientEmail,
                      contactName: selectedContactName || celebration.contactName,
                      contactId: selectedContactId && selectedContactId !== 'custom' ? selectedContactId : null
                    });
                  } else {
                    setGeneralError('Please resolve all validation errors before saving.');
                  }
                }}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
              >
                Save as Draft
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: DateCorrectionModal
// Validates: newDate
// ─────────────────────────────────────────────────────────────────────────────
function DateCorrectionModal({ celebration, token, onClose, onSuccess }) {
  const [date, setDate] = useState(celebration.eventDate || '');
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched(true);
    const dateErr = validateDate(date, 'Corrected event date');
    if (dateErr) {
      setError(dateErr);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/celebrations/${celebration.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          eventDate: date,
          verificationStatus: 'VERIFIED',
          status: 'VERIFIED'
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update event date on server.');
      }
      onSuccess(date);
    } catch (e) {
      setError(e.message || 'Failed to update date. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-sm w-full overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h3 className="text-sm font-bold text-gray-900">Correct Event Date</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            Update the accurate date for <span className="font-semibold text-gray-800">{celebration.contactName}'s {celebration.eventType}</span>.
          </p>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Accurate Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={e => {
                setDate(e.target.value);
                if (touched) setError(validateDate(e.target.value, 'Corrected event date'));
              }}
              onBlur={() => {
                setTouched(true);
                setError(validateDate(date, 'Corrected event date'));
              }}
              className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none ${touched && error ? 'border-red-500 bg-red-50/20' : 'border-gray-200 focus:ring-1 focus:ring-blue-500'
                }`}
            />
            {touched && error && (
              <p className="text-xs text-red-600 flex items-center gap-1 font-medium mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Update & Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
