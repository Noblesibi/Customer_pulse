import fs from 'fs';

let risksJSX = fs.readFileSync('d:/Data/customer_pulse/frontend/src/pages/Risks.jsx', 'utf8');

const updatedTop = `
  const { 
    user,
    accounts,
    fetchAccounts,
    risks, 
    fetchRisks, 
    resolveRisk 
  } = useStore();

  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('Open');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRisk, setSelectedRisk] = useState(null);
  const [showConfigureRules, setShowConfigureRules] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    fetchAccounts(1, '', { limit: 10000 }).then(() => setIsLoaded(true));
    fetchRisks();
  }, []);

  // Compute metrics from actual data
  const totalAccts = accounts ? accounts.length : 0;
  const validHealth = accounts ? accounts.filter(a => typeof a.healthScore === 'number') : [];
  const avgHealth = validHealth.length ? Math.round(validHealth.reduce((sum, a) => sum + a.healthScore, 0) / validHealth.length) : 0;
  
  const displayRisks = risks && risks.length > 0 ? risks : [];
  const openRisks = displayRisks.filter(r => r.status === 'Open');
  const openRisksCount = openRisks.length;
  const criticalRisksCount = openRisks.filter(r => r.severity === 'Critical').length;
  const highRisksCount = openRisks.filter(r => r.severity === 'High').length;
  
  const now = new Date();
  const next90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const renewals90 = accounts ? accounts.filter(a => {
    if(!a.renewalDate) return false;
    const rd = new Date(a.renewalDate);
    return rd >= now && rd <= next90Days;
  }) : [];
  
  const greenCount = validHealth.filter(a => a.healthScore >= 70).length;
  const amberCount = validHealth.filter(a => a.healthScore >= 40 && a.healthScore < 70).length;
  const redCount = validHealth.filter(a => a.healthScore < 40).length;
  const totalWithHealth = validHealth.length || 1;
  const greenPct = (greenCount / totalWithHealth) * 100;
  const amberPct = (amberCount / totalWithHealth) * 100;
  const redPct = (redCount / totalWithHealth) * 100;

  const upcomingRenewalsList = [...renewals90].sort((a,b) => new Date(a.renewalDate) - new Date(b.renewalDate)).slice(0, 4).map(a => {
    const days = Math.floor((new Date(a.renewalDate) - now) / (1000*60*60*24));
    const status = a.healthScore < 40 ? 'Red' : a.healthScore < 70 ? 'Amber' : 'Green';
    return { name: a.companyName || 'Unknown', days, status };
  });

  const lowestHealthAccounts = [...validHealth].sort((a,b) => a.healthScore - b.healthScore).slice(0, 4);

  const risks30Days = displayRisks.filter(r => {
    if(!r.createdAt) return true; 
    const cd = new Date(r.createdAt);
    return (now - cd) / (1000*60*60*24) <= 30;
  });
  const categoryCounts = risks30Days.reduce((acc, r) => {
    const cat = r.category || 'Other';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const risksByCategory = Object.keys(categoryCounts).map(cat => {
     let color = 'bg-blue-500';
     if(cat === 'Relationship' || cat === 'Delivery') color = 'bg-red-500';
     else if(cat === 'Renewal') color = 'bg-amber-500';
     return { label: cat, count: categoryCounts[cat], color };
  }).sort((a,b) => b.count - a.count);
  const maxRiskCat = risksByCategory.length ? risksByCategory[0].count : 1;
  const enrichedRiskCategories = risksByCategory.map(rc => ({
     ...rc,
     width: \`\${(rc.count / maxRiskCat) * 100}%\`
  }));
  
  // Team workload
  const teamMap = {};
  if (accounts) {
    accounts.forEach(a => {
      const owner = a.ownerName || 'Unassigned';
      if(!teamMap[owner]) teamMap[owner] = { accounts: 0, healthSum: 0, risks: 0 };
      teamMap[owner].accounts++;
      if (typeof a.healthScore === 'number') teamMap[owner].healthSum += a.healthScore;
    });
  }
  openRisks.forEach(r => {
    const owner = r.ownerName || 'Unassigned';
    if(teamMap[owner]) teamMap[owner].risks++;
  });
  const teamWorkloadList = Object.keys(teamMap).map(owner => {
     const t = teamMap[owner];
     return {
       name: owner,
       accounts: t.accounts,
       avgHealth: t.accounts > 0 ? Math.round(t.healthSum / t.accounts) : 0,
       risks: t.risks
     };
  }).sort((a,b) => b.accounts - a.accounts).slice(0, 4);

  const filteredRisks = displayRisks.filter(r => {
    const matchSev = severityFilter ? r.severity === severityFilter : true;
    const matchStatus = statusFilter ? r.status === statusFilter : true;
    const matchOwner = ownerFilter ? r.ownerName === ownerFilter : true;
    const matchSearch = searchQuery ? (
      (r.companyName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description || '').toLowerCase().includes(searchQuery.toLowerCase())
    ) : true;
    return matchSev && matchStatus && matchOwner && matchSearch;
  });
`;

// Replace top logic
const topStart = risksJSX.indexOf('const {');
const topEnd = risksJSX.indexOf('const getSeverityColor');
if (topStart > -1 && topEnd > -1) {
  risksJSX = risksJSX.substring(0, topStart) + updatedTop + '\n  ' + risksJSX.substring(topEnd);
}

risksJSX = risksJSX.replace(/<div className="text-2xl font-bold text-black leading-none">24<\/div>/g, '<div className="text-2xl font-bold text-black leading-none">{totalAccts}</div>');
risksJSX = risksJSX.replace(/<div className="text-2xl font-bold text-black leading-none">66<\/div>/g, '<div className="text-2xl font-bold text-black leading-none">{avgHealth}</div>');
risksJSX = risksJSX.replace(/<div className="text-2xl font-bold text-black leading-none">2<\/div>\s*<div className="text-\[10px\] text-red-600 font-medium mt-1">1 Critical · 1 High<\/div>/g, '<div className="text-2xl font-bold text-black leading-none">{openRisksCount}</div>\n            <div className="text-[10px] text-red-600 font-medium mt-1">{criticalRisksCount} Critical · {highRisksCount} High</div>');
risksJSX = risksJSX.replace(/<div className="text-2xl font-bold text-black leading-none">4<\/div>/g, '<div className="text-2xl font-bold text-black leading-none">{renewals90.length}</div>');

risksJSX = risksJSX.replace(/<div className="bg-green-500" style={{width: '58%'}}><\/div>/g, '<div className="bg-green-500" style={{width: `${greenPct}%`}}></div>');
risksJSX = risksJSX.replace(/<div className="bg-amber-500" style={{width: '33%'}}><\/div>/g, '<div className="bg-amber-500" style={{width: `${amberPct}%`}}></div>');
risksJSX = risksJSX.replace(/<div className="bg-red-500" style={{width: '9%'}}><\/div>/g, '<div className="bg-red-500" style={{width: `${redPct}%`}}></div>');

risksJSX = risksJSX.replace(/<span className="text-green-600">Green 14<\/span>/g, '<span className="text-green-600">Green {greenCount}</span>');
risksJSX = risksJSX.replace(/<span className="text-amber-600">Amber 8<\/span>/g, '<span className="text-amber-600\">Amber {amberCount}</span>');
risksJSX = risksJSX.replace(/<span className="text-red-500">Red 2<\/span>/g, '<span className="text-red-500">Red {redCount}</span>');

risksJSX = risksJSX.replace(/\[\s*\{[\s\S]*?\}\s*\].map\(r => \(/, 'upcomingRenewalsList.map(r => (');

const lowestHealthStr = `<div className="space-y-2.5">
              {lowestHealthAccounts.length > 0 ? lowestHealthAccounts.map(a => (
                <div key={a.accountId || a.id} className="flex justify-between items-center text-sm hover:bg-gray-50 p-1 -mx-1 rounded cursor-pointer transition-colors">
                  <span className="text-black font-medium text-sm">{a.companyName}</span>
                  <span className={\`font-bold text-xs \${a.healthScore < 40 ? 'text-red-600' : 'text-amber-600'}\`}>{a.healthScore}</span>
                </div>
              )) : <div className="text-sm text-gray-500 p-2">No health data available</div>}
            </div>`;
risksJSX = risksJSX.replace(/<div className="space-y-2.5">\s*<div className="flex justify-between items-center text-sm hover:bg-gray-50[\s\S]*?<\/div>\s*<\/div>/, lowestHealthStr);

risksJSX = risksJSX.replace(/\[\s*\{[\s\S]*?\}\s*\].map\(item => \(/, 'enrichedRiskCategories.map(item => (');

const workloadStr = `          <div className="space-y-4 mb-5">
            {teamWorkloadList.map(t => (
              <div key={t.name} className="flex justify-between items-center text-sm">
                <span className="text-black font-semibold">{t.name} <span className="text-gray-500 font-medium">· {t.accounts} accounts</span></span>
                <span className="text-gray-600 text-[11px] font-medium">Avg {t.avgHealth} · {t.risks} risk{t.risks !== 1 ? 's' : ''}</span>
              </div>
            ))}
            {teamWorkloadList.length === 0 && <div className="text-sm text-gray-500">No team data available</div>}
          </div>`;
risksJSX = risksJSX.replace(/<div className="space-y-4 mb-5">[\s\S]*?<\/div>\s*<p className="text-\[11px\]/, workloadStr + '\n          <p className="text-[11px]');

fs.writeFileSync('d:/Data/customer_pulse/frontend/src/pages/Risks.jsx', risksJSX);
