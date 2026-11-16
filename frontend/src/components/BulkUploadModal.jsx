import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Upload, FileSpreadsheet, Sparkles, CheckCircle2, AlertTriangle, XCircle, ArrowRight, ArrowLeft, Loader2, Info, Layers, Building2, CheckSquare, Square, UserCheck, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useStore } from '../store';

const TARGET_FIELDS = [
  { field: 'companyName', label: 'Company Name', required: true },
  { field: 'industry', label: 'Industry', required: false },
  { field: 'region', label: 'Region / Address', required: false },
  { field: 'email', label: 'Corporate Mail', required: false },
  { field: 'phone', label: 'Corporate Phone', required: false },
  { field: 'domain', label: 'NeST BU / Domain', required: false },
  { field: 'ownerName', label: 'Account Owner', required: false },
  { field: 'ownerEmail', label: 'Account Owner Email', required: false },
  { field: 'contactName', label: 'Key Contact Name', required: false },
  { field: 'contactEmail', label: 'Key Contact Email', required: false },
  { field: 'contactPhone', label: 'Key Contact Phone', required: false },
  { field: 'contactDesignation', label: 'Designation', required: false },
  { field: 'contactDepartment', label: 'Department', required: false },
  { field: 'keyContact', label: 'Key Contact (Yes/No)', required: false },
  { field: 'contactOwnerName', label: 'Key Contact Owner', required: false },
  { field: 'contactOwnerEmail', label: 'Key Contact Owner Email', required: false }
];

// Dictionary of known NeST Business Units mapped to Sheet Names
export const NEST_BU_MAP = {
  'healthcare': { label: 'Healthcare BU', canonical: 'Healthcare', desc: 'Medical devices, healthcare IT' },
  'abu': { label: 'Aerospace & Defence (ABU)', canonical: 'Aerospace and Defence', desc: 'Aviation, defence electronics' },
  'bfs': { label: 'Banking & Financial Service (BFS)', canonical: 'Banking & Financial Service (BFS)', desc: 'Fintech, banking platforms' },
  'ins': { label: 'Insurance BU (INS)', canonical: 'Insurance', desc: 'Policy administration, insurtech' },
  'ibu': { label: 'Industrial BU (IBU)', canonical: 'Industrial', desc: 'Industrial automation, manufacturing' },
  'mbu': { label: 'Automotive & Mobility (MBU)', canonical: 'Automotive', desc: 'Connected mobility, EV, automotive' },
  'gis': { label: 'GIS BU', canonical: 'GIS', desc: 'Geographic information systems' },
  'sas': { label: 'Semiconductor & Automotive (SAS)', canonical: 'Semiconductor', desc: 'VLSI, embedded systems, chips' },
  'stc': { label: 'Software Technology Center (STC)', canonical: 'Software Technology Center', desc: 'Enterprise software & digital engineering' },
  'te': { label: 'Transportation & Engineering (TE)', canonical: 'Transportation & Engineering', desc: 'Railways, transit systems' }
};

export function resolveNestBu(sheetName) {
  const norm = (sheetName || '').toLowerCase().trim();
  if (!norm) return { label: 'General / Multi-BU', canonical: 'General', desc: 'NeST Business Unit' };

  // Generic or template sheet names should not be forced into a specific BU
  if (/^(template|sheet\s*\d*|accounts?|customers?|data|upload|contacts?|all|master)$/i.test(norm)) {
    return { label: `${sheetName} (Multi-BU Sheet)`, canonical: '', isGeneric: true, desc: 'Multi-BU or generic template sheet' };
  }

  // Exact match in map
  if (NEST_BU_MAP[norm]) return NEST_BU_MAP[norm];

  // Word-boundary / keyword matching to prevent accidental substring matches (e.g. 'te' in 'template')
  const keywordRules = [
    { regex: /\b(?:te|transportation|rail|transit)\b/i, key: 'te' },
    { regex: /\b(?:abu|aerospace|defence|defense|aviation)\b/i, key: 'abu' },
    { regex: /\b(?:bfs|banking|fintech|financial)\b/i, key: 'bfs' },
    { regex: /\b(?:ins|insurance|insurtech)\b/i, key: 'ins' },
    { regex: /\b(?:ibu|industrial|manufacturing)\b/i, key: 'ibu' },
    { regex: /\b(?:mbu|automotive|mobility)\b/i, key: 'mbu' },
    { regex: /\b(?:gis|geographic)\b/i, key: 'gis' },
    { regex: /\b(?:sas|semiconductor|vlsi|chips)\b/i, key: 'sas' },
    { regex: /\b(?:stc|software|digital\s*engineering)\b/i, key: 'stc' },
    { regex: /\b(?:healthcare|medical|health)\b/i, key: 'healthcare' },
  ];

  for (const rule of keywordRules) {
    if (rule.regex.test(norm)) {
      return NEST_BU_MAP[rule.key];
    }
  }

  return { label: `${sheetName} BU`, canonical: sheetName, desc: 'NeST Business Unit' };
}

// Smart Heuristic Mapper for common Excel column titles
function heuristicAutoMap(headers) {
  const mapping = {};
  const rules = [
    { field: 'companyName', regex: /^(?:customer|client|company|account)(?:\s*name)?$/i },
    { field: 'contactName', regex: /^(?:key\s*contact.*?name|key\s*contact|contact\s*name|poc|person)(?:\s*name)?$/i },
    { field: 'contactDesignation', regex: /^(?:designation|job\s*title|position|role)$/i },
    { field: 'contactOwnerEmail', regex: /(?:key\s*contact\s*owner\s*email|contact\s*owner\s*email)/i },
    { field: 'contactEmail', regex: /(?:direct\s*(?:email|mail)|contact\s*(?:email|mail)|key\s*contact\s*(?:email|mail)|^email$|^mail$|email\s*(?:id|address)|direct\s*mail\s*id)/i },
    { field: 'ownerEmail', regex: /(?:account\s*owner\s*email|owner\s*email)/i },
    { field: 'email', regex: /(?:corporate\s*email|company\s*email|board\s*email|general\s*email)/i },
    { field: 'contactPhone', regex: /(?:mobile|direct\s*phone|contact\s*(?:no|number|#)|key\s*contact\s*number)/i },
    { field: 'phone', regex: /(?:corporate\s*phone|company\s*phone|board\s*number|^phone(?:\s*number)?$)/i },
    { field: 'region', regex: /(?:customer\s*entity\s*address|entity\s*address|^address$|^location$|^region$|company\s*address)/i },
    { field: 'domain', regex: /(?:nest\s*bu|^domain$|^business\s*unit$)/i },
    { field: 'contactOwnerName', regex: /(?:key\s*contact\s*owner|contact\s*owner)/i },
    { field: 'ownerName', regex: /(?:account\s*owner|relationship\s*manager|^owner$)/i },
    { field: 'contactDepartment', regex: /(?:^department$|^dept$)/i },
    { field: 'keyContact', regex: /(?:key\s*contact|primary\s*contact)/i },
    { field: 'industry', regex: /(?:^industry$|^sector$|^bu$)/i }
  ];

  headers.forEach(h => {
    if (!h || h.startsWith('__empty')) return;
    const clean = h.trim();
    for (const rule of rules) {
      if (rule.regex.test(clean) && !Object.values(mapping).includes(rule.field)) {
        mapping[h] = rule.field;
        break;
      }
    }
  });

  return mapping;
}

// Automatically detect the most likely header row in a spreadsheet
function detectHeaderRow(rawRows) {
  let bestIdx = 0;
  let maxScore = -1;
  const maxScan = Math.min(15, rawRows.length);

  for (let i = 0; i < maxScan; i++) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;
    const filled = row.filter(c => c !== null && c !== undefined && String(c).trim().length > 0);
    
    // Count how many cells in this row match typical header keywords
    const keywordMatches = row.filter(c => typeof c === 'string' && /customer|account|company|contact|email|phone|mobile|designation|name|address|domain|bu|sl no|industry|region/i.test(String(c).trim())).length;
    
    // Score heavily favors rows with multiple keywords, penalizes rows further down
    const score = (filled.length * 2) + (keywordMatches * 15) - i;
    
    if (score > maxScore && filled.length >= 2) {
      maxScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export default function BulkUploadModal({ isOpen, onClose }) {
  const [step, setStep] = useState(1);
  const [sampleRowIndex, setSampleRowIndex] = useState(0);
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [preparedRecords, setPreparedRecords] = useState([]);
  const [editingAccountIdx, setEditingAccountIdx] = useState(null);
  const [editForm, setEditForm] = useState({ companyName: '', domain: '', ownerName: '' });

  // Workbook & Multi-sheet State
  const [workbook, setWorkbook] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [headerRowIdx, setHeaderRowIdx] = useState(0);
  
  // Import Mode: 'single' (map & import one sheet) or 'batch' (select multiple BU sheets)
  const [importMode, setImportMode] = useState('single');
  const [selectedBatchSheets, setSelectedBatchSheets] = useState([]); // array of sheet names
  const [sheetSummaries, setSheetSummaries] = useState({}); // { sheetName: { bu, rowCount, accountCount } }
  const [defaultFallbackOwner, setDefaultFallbackOwner] = useState('');
  const [fallbackOwnerSearch, setFallbackOwnerSearch] = useState('');
  const [showFallbackOwnerDropdown, setShowFallbackOwnerDropdown] = useState(false);
  
  // Data State
  const [rawHeaders, setRawHeaders] = useState([]);
  const [rawData, setRawData] = useState([]);
  const [columnMapping, setColumnMapping] = useState({}); // { rawHeader: targetField }
  
  // Validation State
  const [previewResult, setPreviewResult] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [sheetOwner, setSheetOwner] = useState(null);

  const fileInputRef = useRef(null);
  const { suggestColumnMapping, bulkImportAccounts, fetchAccounts, fetchStaff, user, staffList } = useStore();

  useEffect(() => {
    if (fetchStaff) fetchStaff();
  }, [fetchStaff]);

  const uniqueSampleRows = React.useMemo(() => {
    const validRows = [];
    
    for (const row of rawData) {
      // Check if this row actually has values for the detected headers
      const hasAnyValue = rawHeaders.some(h => row[h] && row[h].trim() !== '');
      if (hasAnyValue) {
        validRows.push(row);
      }
    }
    
    return validRows.length > 0 ? validRows : rawData;
  }, [rawData, rawHeaders]);

  if (!isOpen) return null;

  const resetState = () => {
    setStep(1);
    setSampleRowIndex(0);
    setFile(null);
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheet('');
    setSheetOwner(null);
    setHeaderRowIdx(0);
    setImportMode('single');
    setSelectedBatchSheets([]);
    setSheetSummaries({});
    setPreparedRecords([]);
    setEditingAccountIdx(null);
    setRawHeaders([]);
    setRawData([]);
    setColumnMapping({});
    setPreviewResult(null);
    setImportResult(null);
    setIsProcessing(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleDownloadTemplate = (e) => {
    e.stopPropagation();
    const headers = [
      "Sl No", "Company Name", "Company Address", "General Email", "Phone Number", 
      "NeST BU", "Key Contact Name", "Key Contact Number", "Direct Email", "Designation", 
      "Account Owner", "Account owner email", "Key Contact Owner", "key contact owner email"
    ];
    const data = [
      headers,
      ["1", "Acme Corp", "123 Tech Lane, NY", "info@acmecorp.com", "+1-555-0199", "Transportation & Engineering", "John Doe", "+1-555-0199", "john.doe@acmecorp.com", "CTO", "Jane Smith", "janesmith@nestgroup.net", "Linta Thomas", "linta@nestgroup.net"],
      ["1", "Acme Corp", "124 Tech Lane, NY", "info@acmecorp.com", "+1-555-0199", "Transportation & Engineering", "Sara Madison", "+1-555-3302", "sara.madison@acmecorp.com", "Manager", "", "", "Dustin Clarke", "dustin@nestgroup.net"],
      ["2", "Globex Inc", "456 Global Blvd, CA", "contact@globex.com", "", "Healthcare", "Mary Major", "+1-555-0201", "mary.major@globex.com", "VP Engineering", "Alan Wake", "alanwake@nestgroup.net", "Christy Mathew", "christy@nestgroup.net"],
      ["2", "Globex Inc", "457 Global Blvd, CA", "contact@globex.com", "", "Healthcare", "James Xavier", "+1-555-4455", "james.xavier@globex.com", "CEO", "", "", "Sona Maria", "sona@nestgroup.net"]
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 5, 15) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "CustomerPulse_Import_Template.xlsx");
  };

  const extractNestEmail = (val) => {
    if (typeof val !== 'string') return null;
    const match = val.match(/[\w.-]+@(?:nestgroup\.net|nestdigital\.com|nestgroup\.com)/i);
    return match ? match[0].toLowerCase().trim() : null;
  };

  const cleanNameCandidate = (str) => {
    if (!str || typeof str !== 'string') return '';
    const s = str.trim().replace(/\r?\n/g, ' ');
    if (s.includes('@') || /http|www|\.com|\.net|fy\s*\d|sl\s*no|customer|direct|indirect|yes|no|address|plot|phone|mobile|date/i.test(s)) return '';
    if (/^[A-Za-z\s.'-]{2,50}$/.test(s)) {
      return s;
    }
    return '';
  };

  // Detect sheet-level BU Head / Account Owner from signatures in the sheet (e.g. footer rows)
  const detectSheetOwner = (rawRows, staff = []) => {
    if (!rawRows || rawRows.length === 0) return null;

    for (let rIdx = rawRows.length - 1; rIdx >= 0; rIdx--) {
      const row = rawRows[rIdx];
      if (!Array.isArray(row)) continue;

      for (let cIdx = 0; cIdx < row.length; cIdx++) {
        const cell = String(row[cIdx] || '').trim();
        const email = extractNestEmail(cell);
        if (email) {
          // 1. Check staff directory in store
          const staffMatch = (staff || []).find(s => s.email && s.email.toLowerCase().trim() === email);
          let name = staffMatch?.name || '';
          let uid = staffMatch?.uid || staffMatch?.id || null;

          // 2. Check cell directly above
          if (!name && rIdx > 0) {
            const aboveVal = cleanNameCandidate(String(rawRows[rIdx - 1]?.[cIdx] || ''));
            if (aboveVal) name = aboveVal;
          }
          // 3. Check cell directly below
          if (!name && rIdx + 1 < rawRows.length) {
            const belowVal = cleanNameCandidate(String(rawRows[rIdx + 1]?.[cIdx] || ''));
            if (belowVal) name = belowVal;
          }
          // 4. Check adjacent left or right
          if (!name && cIdx > 0) {
            const leftVal = cleanNameCandidate(String(row[cIdx - 1] || ''));
            if (leftVal) name = leftVal;
          }
          if (!name && cIdx + 1 < row.length) {
            const rightVal = cleanNameCandidate(String(row[cIdx + 1] || ''));
            if (rightVal) name = rightVal;
          }
          // 5. Fallback from email prefix
          if (!name) {
            const prefix = email.split('@')[0].replace(/[._]/g, ' ');
            name = prefix.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          }

          return { name, email, uid, rowIdx: rIdx + 1, colIdx: cIdx };
        }
      }
    }
    return null;
  };

  // Helper to extract structured account/contact records from a sheet
  const extractRecordsFromSheet = (wb, targetSheetName, staff = staffList) => {
    const s = wb.Sheets[targetSheetName];
    if (!s) return { headers: [], rows: [], headerRowIdx: 0, bu: resolveNestBu(targetSheetName), sheetOwner: null };

    const rawRows = XLSX.utils.sheet_to_json(s, { header: 1, defval: '' });
    if (!rawRows || rawRows.length === 0) return { headers: [], rows: [], headerRowIdx: 0, bu: resolveNestBu(targetSheetName), sheetOwner: null };

    // Detect sheet-level BU Head / Account Owner from NeST signature in sheet
    const detectedOwner = detectSheetOwner(rawRows, staff);

    const hIdx = detectHeaderRow(rawRows);
    const detectedHeaders = (rawRows[hIdx] || []).map((h, i) => 
      h && String(h).trim() ? String(h).trim().replace(/\r?\n/g, ' ') : `__empty_${i + 1}`
    );

    const compColIdx = detectedHeaders.findIndex(h => /customer|company|client|account/i.test(h) && !/owner|manager/i.test(h));
    const contactColIdx = detectedHeaders.findIndex(h => /contact|poc|person/i.test(h) && !/customer|company|client|account/i.test(h));

    const buInfo = resolveNestBu(targetSheetName);
    const dataRows = rawRows.slice(hIdx + 1);
    let lastCompanyName = '';
    const structuredRows = [];

    dataRows.forEach(row => {
      if (!Array.isArray(row) || row.every(c => c === null || c === undefined || String(c).trim() === '')) return;

      const rowStr = JSON.stringify(row);
      // if (/from fy|till fy|\(yes\s*\/no\)/i.test(rowStr) && !rowStr.includes('@') && !rowStr.includes('http')) return;


      let rawComp = compColIdx !== -1 && row[compColIdx] ? String(row[compColIdx]).trim() : '';
      let rawContact = contactColIdx !== -1 && row[contactColIdx] ? String(row[contactColIdx]).trim() : '';

      // Carry-over / Forward-fill customer name across multiple contacts
      if (rawComp) {
        lastCompanyName = rawComp;
      } else if (lastCompanyName) {
        rawComp = lastCompanyName;
      }

      // Only aggressively filter out rows if we confidently identified the primary key columns.
      // Disabled to prevent falsely dropping rows when column heuristic is wrong.

      const obj = {};
      detectedHeaders.forEach((h, i) => {
        obj[h] = row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : '';
      });
      if (compColIdx !== -1) obj[detectedHeaders[compColIdx]] = rawComp;
      
      // Auto-assign canonical NeST BU to every row in this sheet
      obj.__default_domain = buInfo.canonical;

      // Assign detected sheet owner by default
      if (detectedOwner) {
        obj.ownerName = detectedOwner.name;
        obj.ownerEmail = detectedOwner.email;
        obj.ownerId = detectedOwner.uid;
      }

      // Removing aggressive row-level email scanning for account owners to prevent false positives (like picking up NeST contacts instead of owners).

      structuredRows.push(obj);
    });

    return { headers: detectedHeaders, rows: structuredRows, headerRowIdx: hIdx, bu: buInfo, sheetOwner: detectedOwner, rawRowsCount: rawRows.length, dataRowsCount: dataRows.length };
  };

  // --- Process and Load a Specific Sheet for Single Mode ---
  const loadSheet = async (wb, targetSheetName, forcedHIdx = null) => {
    setSelectedSheet(targetSheetName);
    setSampleRowIndex(0);
    const extracted = extractRecordsFromSheet(wb, targetSheetName, staffList);
    if (!extracted || extracted.headers.length === 0) {
      setRawHeaders([]);
      setRawData([]);
      setColumnMapping({});
      setSheetOwner(null);
      return;
    }

    setSheetOwner(extracted.sheetOwner || null);
    setHeaderRowIdx(extracted.headerRowIdx);
    setRawHeaders(extracted.headers);
    setRawData(extracted.rows);

    // Apply heuristic fast mapping
    const baseMapping = heuristicAutoMap(extracted.headers);
    setColumnMapping(baseMapping);

    // Call AI to refine mapping
    try {
      const sampleRow = extracted.rows[0] || {};
      const aiMapping = await suggestColumnMapping(extracted.headers.filter(h => !h.startsWith('__empty')), sampleRow);
      if (aiMapping && Object.keys(aiMapping).length > 0) {
        setColumnMapping(prev => {
          const next = { ...prev };
          Object.keys(aiMapping).forEach(key => {
            if (aiMapping[key] !== null && aiMapping[key] !== undefined) {
              next[key] = aiMapping[key];
            }
          });
          return next;
        });
      }
    } catch (_) {}
  };

  // --- Step 1: File Selection & AI Analysis ---
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    
    setFile(selectedFile);
    setIsProcessing(true);

    try {
      const data = await selectedFile.arrayBuffer();
      const wb = XLSX.read(data);
      setWorkbook(wb);
      setSheetNames(wb.SheetNames);

      // Build summaries for all sheets
      const summaries = {};
      const validSheets = [];
      wb.SheetNames.forEach(name => {
        const isInfo = /guidelines|instruction|cover|notes|readme/i.test(name);
        const bu = resolveNestBu(name);
        if (!isInfo) {
          const res = extractRecordsFromSheet(wb, name, staffList);
          const slNoCol = res.headers.find(h => h && h.toLowerCase().includes('sl no'));
          const compCol = res.headers.find(h => h && /customer|company|account|client/i.test(h) && !/owner|manager/i.test(h));
          
          let accountCount = 0;
          const uniqueComps = compCol ? new Set(res.rows.map(r => r[compCol]).filter(Boolean)).size : 0;
          const uniqueSls = slNoCol ? new Set(res.rows.map(r => r[slNoCol]).filter(Boolean)).size : 0;
          
          if (uniqueComps > 0) {
            accountCount = uniqueComps;
          } else if (uniqueSls > 0) {
            accountCount = uniqueSls;
          } else {
            accountCount = res.rows.length;
          }

          summaries[name] = {
            bu: bu.canonical,
            label: bu.label,
            desc: bu.desc,
            rowCount: res.rows.length,
            accountCount: accountCount,
            owner: res.sheetOwner,
            rawRowsCount: res.rawRowsCount,
            dataRowsCount: res.dataRowsCount
          };
          if (accountCount > 0) validSheets.push(name);
        } else {
          summaries[name] = { bu: 'Guidelines', label: 'Guidelines (Instructions only)', desc: 'Not a BU', rowCount: 0, accountCount: 0 };
        }
      });
      setSheetSummaries(summaries);
      setSelectedBatchSheets(validSheets);

      // Pick default sheet
      let initialSheet = validSheets[0] || wb.SheetNames[0];
      await loadSheet(wb, initialSheet);
      setStep(2);
      
    } catch (error) {
      console.error("Error reading file:", error);
      alert("Failed to read the file. Please ensure it is a valid .xlsx, .xls, or .csv file.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSheetSwitch = async (newSheetName) => {
    if (!workbook) return;
    setIsProcessing(true);
    await loadSheet(workbook, newSheetName);
    setIsProcessing(false);
  };

  const toggleBatchSheet = (sheetName) => {
    setSelectedBatchSheets(prev => 
      prev.includes(sheetName) ? prev.filter(s => s !== sheetName) : [...prev, sheetName]
    );
  };

  // --- Step 2: Mapping Validation & Preview ---
  const handleMappingChange = (header, targetField) => {
    setColumnMapping(prev => ({
      ...prev,
      [header]: targetField === 'unmapped' ? null : targetField
    }));
  };

  const handleConfirmMapping = async () => {
    setIsProcessing(true);

    const truncateField = (val, target) => {
      if (typeof val !== 'string') return val;
      const v = val.trim();
      if (['industry', 'region', 'department', 'contactDepartment', 'projectIndustry', 'projectType'].includes(target)) return v.substring(0, 99);
      if (['phone', 'contactPhone'].includes(target)) return v.substring(0, 49);
      return v.substring(0, 149);
    };

    let allRecordsToImport = [];

    if (importMode === 'batch') {
      if (selectedBatchSheets.length === 0) {
        alert("Please select at least one NeST BU sheet to import.");
        setIsProcessing(false);
        return;
      }

      // Collect records across all selected BU sheets
      for (const sheetName of selectedBatchSheets) {
        const extracted = extractRecordsFromSheet(workbook, sheetName, staffList);
        const sheetMapping = heuristicAutoMap(extracted.headers);
        const buInfo = resolveNestBu(sheetName);
        const bSheetOwner = extracted.sheetOwner;

        const sheetRecords = extracted.rows.map(row => {
          const mapped = {};
          Object.keys(sheetMapping).forEach(header => {
            const target = sheetMapping[header];
            if (target && row[header]) {
              mapped[target] = truncateField(String(row[header]), target);
            }
          });
          // Auto-tag with canonical NeST BU only if not present in row
          if (!mapped.domain && buInfo.canonical) {
            mapped.domain = buInfo.canonical;
          }
          if (!mapped.ownerName) {
            mapped.ownerName = row.ownerName || bSheetOwner?.name || defaultFallbackOwner || user?.name || '';
            if (!mapped.ownerEmail) {
              mapped.ownerEmail = row.ownerEmail || bSheetOwner?.email || '';
            }
            if (!mapped.ownerId && (row.ownerId || bSheetOwner?.uid)) {
              mapped.ownerId = row.ownerId || bSheetOwner?.uid;
            }
          }
          return mapped;
        }).filter(r => r.companyName && r.companyName.trim());

        allRecordsToImport = allRecordsToImport.concat(sheetRecords);
      }
    } else {
      // Single Sheet Mode
      const hasCompanyName = Object.values(columnMapping).includes('companyName');
      if (!hasCompanyName) {
        alert("Please map at least one column to 'Company Name' to proceed.");
        setIsProcessing(false);
        return;
      }

      const currentBu = resolveNestBu(selectedSheet);
      allRecordsToImport = rawData.map(row => {
        const mappedRecord = {};
        Object.keys(columnMapping).forEach(header => {
          const target = columnMapping[header];
          if (target && row[header] !== undefined && row[header] !== null) {
            mappedRecord[target] = truncateField(String(row[header]), target);
          }
        });
        // Auto-assign canonical NeST BU from sheet if not specified in row
        if (!mappedRecord.domain && currentBu.canonical && !currentBu.isGeneric) {
          mappedRecord.domain = currentBu.canonical;
        }
        // Use column-mapped ownerName first (from Account Owner column).
        // Only fall back to NeST-email-scanned owner / sheet owner / default if no column was mapped.
        if (!mappedRecord.ownerName) {
          mappedRecord.ownerName = row.ownerName || sheetOwner?.name || defaultFallbackOwner || user?.name || '';
          if (!mappedRecord.ownerEmail) {
            mappedRecord.ownerEmail = row.ownerEmail || sheetOwner?.email || '';
          }
          if (!mappedRecord.ownerId && (row.ownerId || sheetOwner?.uid)) {
            mappedRecord.ownerId = row.ownerId || sheetOwner?.uid;
          }
        }
        return mappedRecord;
      }).filter(r => r.companyName && r.companyName.trim());
    }

    if (allRecordsToImport.length === 0) {
      alert("No valid account rows found to import.");
      setIsProcessing(false);
      return;
    }

    setStep(3); // Go to Preview Step
    setPreparedRecords(allRecordsToImport);

    const res = await bulkImportAccounts(allRecordsToImport, true); // Preview=true
    if (res.ok) {
      setPreviewResult(res.data);
    } else {
      alert("Failed to generate preview: " + (res.data?.error || 'Unknown error'));
      setStep(2);
    }
    setIsProcessing(false);
  };

  // --- Step 3: Final Import ---
  const handleFinalImport = async () => {
    setIsProcessing(true);

    const res = await bulkImportAccounts(preparedRecords, false); // Preview=false
    setIsProcessing(false);

    if (res.ok) {
      setImportResult(res.data);
      setStep(4); // Success Step
      fetchAccounts(); // Refresh account list in background
    } else {
      alert("Import failed: " + (res.data?.error || 'Unknown error'));
    }
  };

  const handleSaveEdit = (idx) => {
    const accountToEdit = previewResult.accounts[idx];
    const oldName = accountToEdit.companyName;
    
    const updatedAccounts = [...previewResult.accounts];
    updatedAccounts[idx] = { ...updatedAccounts[idx], ...editForm };
    if (editForm.contacts) {
      updatedAccounts[idx].contacts = editForm.contacts.map(c => ({...c, name: c.name}));
    }
    setPreviewResult({ ...previewResult, accounts: updatedAccounts });

    const updatedPrepared = preparedRecords.map(r => {
      if (r.companyName === oldName) {
        let updatedRow = { ...r, companyName: editForm.companyName, domain: editForm.domain, ownerName: editForm.ownerName };
        if (editForm.contacts) {
          const editedContact = editForm.contacts.find(c => c.originalName === r.contactName);
          if (editedContact) {
            updatedRow.contactName = editedContact.name;
          }
        }
        return updatedRow;
      }
      return r;
    });
    setPreparedRecords(updatedPrepared);
    setEditingAccountIdx(null);
  };

  let currentBu = resolveNestBu(selectedSheet);
  const domainCol = Object.keys(columnMapping).find(k => columnMapping[k] === 'domain');
  let columnBuValues = []; // raw BU values from the excel column
  if (domainCol && rawData && rawData.length > 0) {
    columnBuValues = [...new Set(rawData.map(r => r[domainCol] ? String(r[domainCol]).trim() : '').filter(Boolean))];
    if (columnBuValues.length === 1) {
      currentBu = { canonical: columnBuValues[0], label: columnBuValues[0], desc: 'Fetched from column' };
    } else if (columnBuValues.length > 1) {
      currentBu = { 
        canonical: `Per-Row`, 
        label: columnBuValues.join(', '), 
        desc: `${columnBuValues.length} BUs detected in '${domainCol}' column`,
        isMulti: true,
        values: columnBuValues,
        count: columnBuValues.length 
      };
    }
  }
  // Compute unique owners from the mapped 'ownerName' column (preferred) or fall back to detected sheet owner
  const ownerCol = Object.keys(columnMapping).find(k => columnMapping[k] === 'ownerName');
  let columnOwnerValues = [];
  if (ownerCol && rawData && rawData.length > 0) {
    columnOwnerValues = [...new Set(rawData.map(r => r[ownerCol] ? String(r[ownerCol]).trim() : '').filter(Boolean))];
  }
  const detectedOwners = [...new Set([
    sheetOwner?.name,
    ...rawData.map(r => r.ownerName)
  ].filter(Boolean))];
  const detectedSheetOwner = sheetOwner?.name || (detectedOwners.length > 0 ? detectedOwners.join(', ') : null);
  const meaningfulHeaders = rawHeaders.filter(h => !h.startsWith('__empty_'));
  const emptyHeaders = rawHeaders.filter(h => h.startsWith('__empty_'));
  const displayHeaders = [...meaningfulHeaders, ...emptyHeaders];

  return ReactDOM.createPortal(
    <div 
      className="fixed inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in p-4 sm:p-6"
      style={{ zIndex: 999999 }}
    >
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden my-auto">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-50 rounded-xl border border-indigo-100">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                <span>Intelligent NeST BU Excel Importer</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Step {step} of 4
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {step === 1 && "Upload your customer account spreadsheet (.xlsx, .xls, .csv)"}
                {step === 2 && "Intelligently detects NeST Business Units from sheets and maps accounts automatically."}
                {step === 3 && "Verify parsed accounts, NeST BU mapping, and duplicate detection before saving."}
                {step === 4 && "Import complete! Accounts and contacts have been loaded into CustomerPulse."}
              </p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50">
          {/* STEP 1: File Upload */}
          {step === 1 && (
            <div className="space-y-6">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer bg-white hover:bg-indigo-50/30 transition-all group shadow-sm"
              >
                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 text-indigo-600 group-hover:scale-110 transition-transform mb-4 shadow-sm">
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1">Click to select a spreadsheet</h3>
                <p className="text-xs text-slate-500 mb-4">Supports .xlsx, .xls, .csv files up to 20MB</p>
                
                <div className="flex items-center space-x-2 text-xs text-indigo-700 bg-indigo-50 px-3.5 py-1.5 rounded-full border border-indigo-200 font-medium">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-detects multi-BU sheets (ABU, Healthcare, GIS, IBU, MBU, BFS, INS, SAS)</span>
                </div>
                
                <button 
                  onClick={handleDownloadTemplate}
                  className="mt-4 px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold rounded-lg border border-slate-300 hover:border-slate-400 transition-colors flex items-center gap-2 z-10 relative shadow-sm"
                >
                  <Download className="w-4 h-4 text-slate-600" /> Download Sample Template
                </button>
                
                <p className="mt-3 text-[11px] text-slate-500 max-w-sm text-center">
                  <strong className="text-slate-700">Note:</strong> When uploading the sample template, all fields are required except Phone Number.
                </p>
                
                <input 
                  ref={fileInputRef} 
                  type="file" 
                  accept=".xlsx, .xls, .csv, .xlsc" 
                  className="hidden" 
                  onChange={handleFileChange}
                />
              </div>

              {isProcessing && (
                <div className="flex items-center justify-center space-x-3 text-slate-600 py-4">
                  <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                  <span className="text-sm font-medium">Analyzing sheets and headers across Business Units...</span>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Sheet Selector & Column Mapping */}
          {step === 2 && (
            <div className="space-y-5 animate-in slide-in-from-right-4">
              {/* Import Mode Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => setImportMode('single')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                      importMode === 'single'
                        ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                        : 'bg-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Import Single BU Sheet
                  </button>
                  <button
                    onClick={() => setImportMode('batch')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                      importMode === 'batch'
                        ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                        : 'bg-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Batch Import Multiple BUs ({selectedBatchSheets.length} selected)
                  </button>
                </div>

                <span className="text-xs text-slate-600 font-medium px-2">
                  Total {sheetNames.filter(s => !/guidelines|instruction/i.test(s)).length} NeST BUs in File
                </span>
              </div>

              {/* BATCH MODE VIEW */}
              {importMode === 'batch' ? (
                <div className="space-y-4">
                  <div className="bg-indigo-50/80 border border-indigo-200 p-4 rounded-xl text-xs text-indigo-900">
                    <p className="font-bold mb-1 flex items-center text-indigo-950">
                      <Building2 className="w-4 h-4 mr-1.5 text-indigo-600" />
                      Select Which NeST Business Units to Upload
                    </p>
                    <p className="text-slate-700">
                      Uncheck any sheet you don't need. CustomerPulse will automatically assign accounts from each selected sheet to their respective NeST Business Unit and auto-detected BU Head!
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
                    {sheetNames.map(sheetName => {
                      const isInfo = /guidelines|instruction/i.test(sheetName);
                      const isSelected = selectedBatchSheets.includes(sheetName);
                      const summary = sheetSummaries[sheetName] || {};

                      return (
                        <div
                          key={sheetName}
                          onClick={() => !isInfo && toggleBatchSheet(sheetName)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                            isInfo 
                              ? 'opacity-40 border-slate-200 bg-slate-100 cursor-not-allowed'
                              : isSelected
                              ? 'border-indigo-400 bg-indigo-50/60 text-slate-900 shadow-sm'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            {!isInfo && (
                              <div className={isSelected ? 'text-indigo-600' : 'text-slate-400'}>
                                {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                              </div>
                            )}
                            <div>
                              <div className="font-semibold text-sm flex items-center space-x-2">
                                <span className="text-slate-900">{sheetName}</span>
                                {summary.bu && !isInfo && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    {summary.bu}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5 flex items-center space-x-1.5">
                                {isInfo ? (
                                  <span>Instructions / Guidelines (Skipped)</span>
                                ) : (
                                  <>
                                    <span>{summary.accountCount || 0} Accounts</span>
                                    <span className="text-pink-600 ml-1 text-[10px]">(R:{summary.rawRowsCount}, D:{summary.dataRowsCount}, P:{summary.rowCount})</span>
                                    <span>•</span>
                                    {summary.owner ? (
                                      <span className="text-emerald-700 font-semibold">Owner: {summary.owner.name}</span>
                                    ) : (
                                      <span>Owner: Default User</span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* SINGLE SHEET MODE VIEW */
                <div className="space-y-5">
                  {/* NeST BU & Account Owner Intelligence Banner */}
                  <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-3.5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 border border-indigo-100">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">
                            Active NeST BU Sheet
                          </div>
                          <select
                            value={selectedSheet}
                            onChange={(e) => handleSheetSwitch(e.target.value)}
                            disabled={isProcessing}
                            className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 font-medium focus:outline-none focus:border-indigo-500 mt-1 cursor-pointer shadow-sm"
                          >
                            {sheetNames.map(name => {
                              const isInfo = /guidelines|instruction/i.test(name);
                              const bu = resolveNestBu(name);
                              return (
                                <option key={name} value={name}>
                                  {name} — {isInfo ? '(Guidelines / Info)' : bu.label}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      {/* Right Badges: NeST BU & Account Owner */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        {/* NeST BU chips - one per unique BU found in Excel */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-slate-600 font-medium flex items-center gap-1 mr-0.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            NeST BU:
                          </span>
                          {currentBu.isMulti ? (
                            // Show each BU as its own chip
                            currentBu.values.map((buVal, idx) => {
                              const colors = [
                                'bg-indigo-50 text-indigo-700 border-indigo-200',
                                'bg-violet-50 text-violet-700 border-violet-200',
                                'bg-cyan-50 text-cyan-800 border-cyan-200',
                                'bg-emerald-50 text-emerald-800 border-emerald-200',
                                'bg-amber-50 text-amber-800 border-amber-200',
                                'bg-pink-50 text-pink-700 border-pink-200',
                              ];
                              const color = colors[idx % colors.length];
                              return (
                                <span
                                  key={buVal}
                                  className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${color}`}
                                  title={`${rawData.filter(r => r[domainCol] && String(r[domainCol]).trim() === buVal).length} rows`}
                                >
                                  {buVal}
                                  <span className="ml-1 text-[9px] opacity-75 font-normal">
                                    ×{rawData.filter(r => r[domainCol] && String(r[domainCol]).trim() === buVal).length}
                                  </span>
                                </span>
                              );
                            })
                          ) : (
                            <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200">
                              {currentBu.canonical || (currentBu.isGeneric ? 'Read From Excel Rows' : currentBu.label)}
                            </span>
                          )}
                        </div>

                        {/* Account Owner chips */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-slate-600 font-medium flex items-center gap-1 mr-0.5">
                            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                            Account Owner:
                          </span>
                          {columnOwnerValues.length > 0 ? (
                            // Show each unique owner from the Excel column as a chip
                            columnOwnerValues.map((ownerVal, idx) => {
                              const rowCount = rawData.filter(r => ownerCol && String(r[ownerCol] || '').trim() === ownerVal).length;
                              return (
                                <span
                                  key={ownerVal}
                                  className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-200"
                                  title={`${rowCount} account${rowCount !== 1 ? 's' : ''} assigned to ${ownerVal}`}
                                >
                                  {ownerVal}
                                  {columnOwnerValues.length > 1 && (
                                    <span className="ml-1 text-[9px] opacity-75 font-normal">×{rowCount}</span>
                                  )}
                                </span>
                              );
                            })
                          ) : detectedSheetOwner ? (
                            // Fallback: sheet-level detected owner (from NeST email scan)
                            <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-200">
                              {detectedSheetOwner}
                              {sheetOwner?.email ? <span className="ml-1 text-[9px] opacity-75 font-normal">({sheetOwner.email})</span> : null}
                            </span>
                          ) : defaultFallbackOwner ? (
                            <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-300">
                              Fallback: {defaultFallbackOwner}
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-300">
                              Current User ({user?.name || 'Admin User'})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Explanatory notes & Fallback Owner setting */}
                    <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-slate-600">
                      <div className="flex items-center space-x-2 self-end sm:self-auto bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 relative">
                        <span className="text-slate-600 font-medium">Default/Fallback Owner:</span>
                        <div className="relative">
                          <input
                            type="text"
                            value={showFallbackOwnerDropdown ? fallbackOwnerSearch : (defaultFallbackOwner || `Current User (${user?.name || 'Admin User'})`)}
                            onFocus={() => {
                              setShowFallbackOwnerDropdown(true);
                              setFallbackOwnerSearch('');
                            }}
                            onChange={(e) => setFallbackOwnerSearch(e.target.value)}
                            onBlur={() => setTimeout(() => setShowFallbackOwnerDropdown(false), 200)}
                            placeholder="Search owner..."
                            className="bg-white text-slate-900 font-medium text-xs rounded border border-slate-300 px-2 py-0.5 focus:outline-none focus:border-indigo-500 w-48 shadow-sm"
                          />
                          {showFallbackOwnerDropdown && (
                            <div className="absolute z-50 w-full top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                              <button
                                type="button"
                                onMouseDown={() => {
                                  setDefaultFallbackOwner('');
                                  setShowFallbackOwnerDropdown(false);
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-indigo-50"
                              >
                                Current User ({user?.name || 'Admin User'})
                              </button>
                              {staffList
                                ?.filter(s => s.name && s.name.toLowerCase().includes(fallbackOwnerSearch.toLowerCase()))
                                .map(s => (
                                  <button
                                    key={s.uid || s.email}
                                    type="button"
                                    onMouseDown={() => {
                                      setDefaultFallbackOwner(s.name);
                                      setShowFallbackOwnerDropdown(false);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs text-slate-800 hover:bg-indigo-50 truncate font-medium"
                                  >
                                    {s.name}
                                  </button>
                                ))
                              }
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Header Row & Columns count */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 flex items-center">
                        Column Mapping
                      </h3>
                      <p className="text-xs text-slate-500">
                        Header detected at <strong className="text-slate-800">Row {headerRowIdx + 1}</strong>. Please confirm the mapped CRM fields.
                      </p>
                    </div>
                    <div className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
                      {meaningfulHeaders.length} Named Columns Found
                    </div>
                  </div>

                  {/* Mapping Table */}
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="max-h-[340px] overflow-auto custom-scrollbar">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 sticky top-0 z-10 text-xs uppercase tracking-wider font-semibold">
                          <tr>
                            <th className="px-4 py-3 font-semibold w-1/3">Your Excel Column</th>
                            <th className="px-4 py-3 font-semibold w-1/3">
                              <div className="flex items-center justify-between pr-4">
                                <span>Sample Data {uniqueSampleRows.length > 0 ? sampleRowIndex + 1 : ''}</span>
                                {uniqueSampleRows.length > 0 && (
                                  <div className="flex bg-white rounded border border-slate-300 overflow-hidden ml-2 shadow-sm">
                                    <button 
                                      onClick={() => setSampleRowIndex(Math.max(0, sampleRowIndex - 1))}
                                      disabled={sampleRowIndex === 0}
                                      className="p-1 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 transition-colors"
                                    >
                                      <ArrowLeft className="w-3 h-3" />
                                    </button>
                                    <div className="w-px bg-slate-300"></div>
                                    <button 
                                      onClick={() => setSampleRowIndex(Math.min(uniqueSampleRows.length - 1, sampleRowIndex + 1))}
                                      disabled={sampleRowIndex === uniqueSampleRows.length - 1}
                                      className="p-1 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 transition-colors"
                                    >
                                      <ArrowRight className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </th>
                            <th className="px-4 py-3 font-semibold w-1/3">Maps to CRM Field</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {displayHeaders.map((header, idx) => {
                            const sampleVal = uniqueSampleRows[sampleRowIndex]?.[header];
                            const targetField = columnMapping[header];
                            const isMapped = !!targetField;
                            const isAutoEmpty = header.startsWith('__empty_');
                            
                            return (
                              <tr key={idx} className={`transition-colors ${isMapped ? 'bg-indigo-50/40 hover:bg-indigo-50/70' : 'hover:bg-slate-50'}`}>
                                <td className="px-4 py-3 text-slate-900 font-medium">
                                  <div className="flex items-center space-x-2">
                                    {isMapped && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
                                    <span className={isAutoEmpty ? 'text-slate-400 italic text-xs' : 'text-slate-800'}>
                                      {isAutoEmpty ? `(Blank Header Col ${header.replace('__empty_', '')})` : header}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-slate-600 truncate max-w-[220px]" title={sampleVal}>
                                  {sampleVal || <span className="text-slate-400 italic">Empty</span>}
                                </td>
                                <td className="px-4 py-3">
                                  <select
                                    value={targetField || 'unmapped'}
                                    onChange={(e) => handleMappingChange(header, e.target.value)}
                                    className={`w-full bg-white border ${targetField ? 'border-indigo-400 text-indigo-900 font-semibold' : 'border-slate-300 text-slate-600'} rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors shadow-sm`}
                                  >
                                    <option value="unmapped">-- Unmapped (Ignore) --</option>
                                    {TARGET_FIELDS.map(f => (
                                      <option key={f.field} value={f.field}>
                                        {f.label} {f.required ? '*' : ''}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Preview & Validation */}
          {step === 3 && (
            <div className="space-y-6 animate-in slide-in-from-right-4">
              {isProcessing ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                  <p className="text-slate-600 font-medium">Grouping records by company and checking duplicates...</p>
                </div>
              ) : previewResult ? (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-sm">
                      <div className="text-2xl font-bold text-slate-900 mb-1">{previewResult.readyAccounts}</div>
                      <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Accounts to Import</div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-sm">
                      <div className="text-2xl font-bold text-slate-900 mb-1">{previewResult.readyContacts}</div>
                      <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Contacts Attached</div>
                    </div>
                    <div className={`border rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-sm ${previewResult.warnings?.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                      <div className={`text-2xl font-bold mb-1 ${previewResult.warnings?.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {previewResult.warnings?.length || 0}
                      </div>
                      <div className={`text-xs uppercase tracking-wider font-semibold ${previewResult.warnings?.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>Warnings / Duplicates</div>
                    </div>
                  </div>

                  {previewResult.warnings && previewResult.warnings.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <h4 className="text-amber-800 font-bold flex items-center mb-2">
                        <AlertTriangle className="w-4 h-4 mr-2 text-amber-600" />
                        Warnings detected ({previewResult.warnings.length})
                      </h4>
                      <ul className="list-disc list-inside text-sm text-amber-900/90 space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                        {previewResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                      <p className="text-xs text-amber-700 mt-3 italic font-medium">Existing accounts will be updated and contacts will be merged cleanly.</p>
                    </div>
                  )}

                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-800">Account Summary & NeST BU Breakdown</h4>
                      <span className="text-xs text-indigo-700 font-semibold">{previewResult.accounts?.length || 0} Companies</span>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                      {previewResult.accounts?.map((acc, i) => (
                        <div key={i} className="px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/80 group">
                          {editingAccountIdx === i ? (
                            <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-indigo-200">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-[10px] uppercase tracking-wider text-slate-600 font-bold mb-1 block">Company Name</label>
                                  <input type="text" value={editForm.companyName} onChange={e => setEditForm({...editForm, companyName: e.target.value})} className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none shadow-sm" />
                                </div>
                                <div>
                                  <label className="text-[10px] uppercase tracking-wider text-slate-600 font-bold mb-1 block">NeST BU</label>
                                  <input type="text" value={editForm.domain} onChange={e => setEditForm({...editForm, domain: e.target.value})} className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none shadow-sm" />
                                </div>
                                <div>
                                  <label className="text-[10px] uppercase tracking-wider text-slate-600 font-bold mb-1 block">Account Owner</label>
                                  <input type="text" value={editForm.ownerName} onChange={e => setEditForm({...editForm, ownerName: e.target.value})} className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none shadow-sm" />
                                </div>
                              </div>
                              {editForm.contacts && editForm.contacts.length > 0 && (
                                <div className="mt-1">
                                  <label className="text-[10px] uppercase tracking-wider text-slate-600 font-bold mb-1 block">Key Contacts</label>
                                  <div className="space-y-2">
                                    {editForm.contacts.map((c, cIdx) => (
                                      <input 
                                        key={cIdx} 
                                        type="text" 
                                        value={c.name} 
                                        onChange={(e) => {
                                          const newContacts = [...editForm.contacts];
                                          newContacts[cIdx].name = e.target.value;
                                          setEditForm({...editForm, contacts: newContacts});
                                        }} 
                                        className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none shadow-sm" 
                                        placeholder="Contact Name"
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="flex justify-end space-x-2">
                                <button onClick={() => setEditingAccountIdx(null)} className="px-3 py-1 text-xs text-slate-600 hover:text-slate-900">Cancel</button>
                                <button onClick={() => handleSaveEdit(i)} className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded shadow-sm">Save</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="font-bold text-slate-900">{acc.companyName}</span>
                                <div className="flex items-center space-x-2">
                                  <button onClick={() => { 
                                    setEditingAccountIdx(i); 
                                    setEditForm({ 
                                      companyName: acc.companyName, 
                                      domain: acc.domain || '', 
                                      ownerName: acc.ownerName || '',
                                      contacts: acc.contacts ? acc.contacts.map(c => ({ ...c, originalName: c.name })) : []
                                    }); 
                                  }} className="opacity-0 group-hover:opacity-100 p-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 transition-opacity">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                  </button>
                                  <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
                                    {acc.domain || 'NeST Digital'}
                                  </span>
                                  {acc.existingAccountId && (
                                    <span className="text-[10px] font-medium px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200">
                                      Existing (Will Update)
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-xs text-slate-500 grid grid-cols-2 gap-2">
                                <div>NeST BU: <span className="text-slate-800 font-medium">{acc.domain || 'NeST Digital'}</span></div>
                                <div>Account Owner: <span className="font-semibold text-emerald-700">{acc.ownerName || 'Auto-Assigned Admin'}</span></div>
                                <div>Address / Region: <span className="text-slate-800">{acc.region || 'None'}</span></div>
                                <div>Contacts: <span className="text-slate-800 font-medium">{acc.contacts?.length || 0}</span></div>
                                <div className="col-span-2 mt-0.5 text-slate-700 truncate font-medium">
                                  {acc.contacts?.map(c => `${c.name} (${c.designation || 'Staff'})`).join(', ')}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {/* STEP 4: Success Summary */}
          {step === 4 && importResult && (
            <div className="h-full flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500 py-10">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6 border-2 border-emerald-200 relative">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 absolute animate-ping opacity-20" />
                <CheckCircle2 className="w-10 h-10 text-emerald-600 relative z-10" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">NeST BU Import Successful!</h3>
              <p className="text-slate-600 mb-6 max-w-md">
                Successfully processed and imported accounts and contacts into CustomerPulse with their assigned NeST Business Units.
              </p>
              
              <div className="bg-white border border-slate-200 rounded-xl p-4 w-full max-w-sm mb-6 flex justify-around shadow-sm">
                <div className="text-center">
                  <div className="text-3xl font-extrabold text-slate-900 mb-1">{importResult.result?.readyAccounts || 0}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Accounts</div>
                </div>
                <div className="w-px bg-slate-200"></div>
                <div className="text-center">
                  <div className="text-3xl font-extrabold text-slate-900 mb-1">{importResult.result?.readyContacts || 0}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Contacts</div>
                </div>
              </div>
              
              <div className="w-full max-w-2xl bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 text-left">
                  <h4 className="text-sm font-bold text-slate-800">Imported Accounts</h4>
                </div>
                <div className="max-h-[200px] overflow-y-auto custom-scrollbar text-left">
                  {previewResult?.accounts?.map((acc, i) => (
                    <div key={i} className="px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 flex justify-between items-center group">
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{acc.companyName}</div>
                        <div className="text-xs text-slate-500">{acc.domain} • {acc.contacts?.length || 0} Contacts</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between">
          <div>
            {step === 2 && (
              <button 
                onClick={() => setStep(1)}
                disabled={isProcessing}
                className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg flex items-center transition-colors font-medium"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Choose Different File
              </button>
            )}
            {step === 3 && (
              <button 
                onClick={() => setStep(2)}
                disabled={isProcessing}
                className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg flex items-center transition-colors font-medium"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back to Selection
              </button>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {step < 4 && (
              <button 
                onClick={handleClose}
                disabled={isProcessing}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            
            {step === 2 && (
              <button 
                onClick={handleConfirmMapping}
                disabled={isProcessing}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg flex items-center transition-colors disabled:opacity-50 shadow-md shadow-indigo-500/20"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {importMode === 'batch' 
                  ? `Preview ${selectedBatchSheets.length} NeST BUs`
                  : 'Confirm Mapping & Preview'}
                {!isProcessing && <ArrowRight className="w-4 h-4 ml-2" />}
              </button>
            )}

            {step === 3 && (
              <button 
                onClick={handleFinalImport}
                disabled={isProcessing}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg flex items-center transition-colors shadow-md shadow-emerald-500/20 disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Confirm & Import {previewResult?.readyAccounts || 0} Accounts
              </button>
            )}

            {step === 4 && (
              <button 
                onClick={handleClose}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-md shadow-indigo-500/20"
              >
                Back to Accounts
              </button>
            )}
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
