import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const apiKey = process.env.GEMINI_API_KEY;
let genAI = null;

if (apiKey && apiKey.trim() !== '' && apiKey !== 'your_gemini_api_key_here') {
  try {
    genAI = new GoogleGenerativeAI(apiKey);
    console.log('🤖 Gemini AI API client initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize Gemini AI client:', error.message);
  }
} else {
  console.log('⚠️ GEMINI_API_KEY is unset or using default placeholder. Running with local NLP analyzer fallback.');
}

/**
 * Local smart NLP rule-based fallback analyzer.
 */
function localAnalyze(text) {
  const lowercase = text.toLowerCase();
  let sentiment = 'Neutral';
  let riskLevel = 'Low';
  let riskCategory = '';
  let severity = 10;
  let summary = 'Standard customer update and status check.';

  // Positive keywords
  const positiveHits = ['happy', 'pleased', 'great', 'excellent', 'love', 'perfect', 'thanks', 'wonderful', 'solved', 'resolved'];
  // Negative keywords
  const negativeHits = ['angry', 'bad', 'downtime', 'frustrated', 'terrible', 'annoyed', 'disappointed', 'fail', 'broken', 'issue', 'problem', 'delay'];

  let posCount = positiveHits.filter(word => lowercase.includes(word)).length;
  let negCount = negativeHits.filter(word => lowercase.includes(word)).length;

  if (posCount > negCount) {
    sentiment = 'Positive';
  } else if (negCount > posCount) {
    sentiment = 'Negative';
  }

  // Detect Risk Category & Level
  if (lowercase.includes('competitor') || lowercase.includes('alternative') || lowercase.includes('switch') || lowercase.includes('other provider')) {
    riskCategory = 'Competitor Mentions';
    riskLevel = 'High';
    severity = 85;
    summary = 'Client mentioned evaluating competitors or switching alternatives.';
  } else if (lowercase.includes('delay') || lowercase.includes('late') || lowercase.includes('shipment') || lowercase.includes('delivery')) {
    riskCategory = 'Delivery Delays';
    riskLevel = 'High';
    severity = 80;
    summary = 'Client expressed frustration regarding delivery delays or shipment delays.';
  } else if (lowercase.includes('escalate') || lowercase.includes('manager') || lowercase.includes('director') || lowercase.includes('superintendent') || lowercase.includes('vp')) {
    riskCategory = 'Escalation';
    riskLevel = 'High';
    severity = 90;
    summary = 'Communication indicates client wants to escalate a support ticket or issue to management.';
  } else if (lowercase.includes('budget') || lowercase.includes('expensive') || lowercase.includes('price') || lowercase.includes('cost') || lowercase.includes('billing')) {
    riskCategory = 'Budget Concerns';
    riskLevel = 'Medium';
    severity = 60;
    summary = 'Client raised concerns regarding pricing structures, budget constraints, or billing discrepancies.';
  } else if (lowercase.includes('contract') || lowercase.includes('renewal') || lowercase.includes('clause') || lowercase.includes('legal')) {
    riskCategory = 'Contract Risks';
    riskLevel = 'Medium';
    severity = 55;
    summary = 'Client raised contractual concerns or questions regarding renewal terms.';
  } else if (lowercase.includes('frustrated') || lowercase.includes('disappointed') || lowercase.includes('terrible') || lowercase.includes('unacceptable')) {
    riskCategory = 'Customer Frustration';
    riskLevel = 'High';
    severity = 75;
    summary = 'High level of customer frustration detected regarding services or product quality.';
  } else if (sentiment === 'Negative') {
    riskCategory = 'Relationship Deterioration';
    riskLevel = 'Medium';
    severity = 50;
    summary = 'Negative sentiment trends and lack of positive resolution indicate potential relationship deterioration.';
  }

  return { sentiment, riskLevel, riskCategory, summary, severity };
}

/**
 * Analyzes communication text using Gemini or falls back to local analyzer.
 */
export async function analyzeCommunication(text) {
  if (!text || text.trim() === '') {
    return localAnalyze('');
  }

  if (!genAI) {
    return localAnalyze(text);
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const prompt = `
      You are an AI-powered CRM analysis agent. Analyze this customer communication text:
      "${text}"

      Respond strictly with a valid JSON object. Do not include markdown wraps (like \`\`\`json).
      JSON schema:
      {
        "sentiment": "Positive" | "Neutral" | "Negative",
        "riskLevel": "Low" | "Medium" | "High",
        "riskCategory": "Customer Frustration" | "Escalation" | "Delivery Delays" | "Competitor Mentions" | "Budget Concerns" | "Contract Risks" | "Relationship Deterioration" | "",
        "summary": "Brief 1-sentence summary of the communication state.",
        "severity": 0 to 100 (where 100 is critical risk)
      }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let responseText = response.text().trim();

    // Clean markdown if Gemini still wrapped it
    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    }

    const parsed = JSON.parse(responseText);
    return {
      sentiment: parsed.sentiment || 'Neutral',
      riskLevel: parsed.riskLevel || 'Low',
      riskCategory: parsed.riskCategory || '',
      summary: parsed.summary || 'Summary generated by Gemini.',
      severity: typeof parsed.severity === 'number' ? parsed.severity : 10
    };
  } catch (error) {
    console.error('Gemini AI call failed, using local fallback:', error.message);
    return localAnalyze(text);
  }
}

/**
 * Generates an executive account summary.
 */
export async function generateExecutiveSummary(companyName, recentInteractionsText, recentRisksText) {
  const defaultSummary = `${companyName} has moderate engagement with some pending topics. Ongoing relationship is stable, but review of outstanding tickets is recommended.`;

  if (!genAI) {
    return defaultSummary;
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const prompt = `
      Create a professional executive relationship summary for company: ${companyName}.
      
      Recent Interactions:
      ${recentInteractionsText}

      Recent Unresolved Risks:
      ${recentRisksText}

      Generate a brief, 2-3 sentence executive report summarizing the status, primary risks, and a clear action recommendation.
    `;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error('Gemini AI summary generation failed:', error.message);
    return defaultSummary;
  }
}

/**
 * Local fallback summarizer for generating task headers.
 */
function localGenerateTaskHeader(text) {
  if (!text) return 'Task Assignment';
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // Pattern matching for calls, conversation, discussion with name
  if (lower.includes('call with') || lower.includes('conversation through call with')) {
    const match = clean.match(/(?:call with|call|conversation with|conversation through call with)\s+([A-Za-z]+)/i);
    if (match && match[1]) {
      return `Call with ${match[1].charAt(0).toUpperCase() + match[1].slice(1)}`;
    }
  }
  if (lower.includes('conversation with')) {
    const match = clean.match(/conversation with\s+([A-Za-z]+)/i);
    if (match && match[1]) {
      return `Sync with ${match[1].charAt(0).toUpperCase() + match[1].slice(1)}`;
    }
  }

  // discussion / conversation triggers
  if (lower.includes('discussion on') || lower.includes('discussion about')) {
    const match = clean.match(/discussion (?:on the|on|about the|about)\s+([^.!?,\n]+)/i);
    if (match && match[1]) {
      const topic = match[1].split(/\s+/).slice(0, 3).join(' ');
      const cleanTopic = topic.replace(/(?:of|the|a|for|new)$/i, '').trim();
      return `${cleanTopic.charAt(0).toUpperCase() + cleanTopic.slice(1)} Discussion`;
    }
  }

  if (lower.includes('shared') && lower.includes('proposal')) return 'Shared Proposal';
  if (lower.includes('strategic') && lower.includes('discussion')) return 'Strategic Discussion';
  if (lower.includes('conducted') && lower.includes('discussion')) return 'Conducted Discussion';
  if (lower.includes('stability')) return 'Stability Feedback';
  if (lower.includes('feedback')) return 'Client Feedback';
  if (lower.includes('onboard')) return 'Customer Onboarding';
  if (lower.includes('review') && lower.includes('account')) return 'Review Accounts';

  // Developer / Finance task keywords
  if (lower.includes('use case')) return 'Use Cases Discussion';
  if (lower.includes('security') || lower.includes('rbac')) return 'Security Audit';
  if (lower.includes('regression') || lower.includes('test')) return 'Regression Testing';
  if (lower.includes('load test')) return 'Load Testing';
  if (lower.includes('appraisal')) return 'Appraisal Review';
  if (lower.includes('budget')) return 'Budget Review';
  if (lower.includes('pending invoice') || lower.includes('verify pending invoices')) return 'Verify Pending Invoices';
  if (lower.includes('shared financial file') || lower.includes('files that have been shared by the finance')) return 'Review Shared Financial Files';

  // Verbose prefixes/suffixes stripping fallback
  let stripped = clean.replace(/^(had a conversation through call with|had a conversation with|had the discussion on the|had the discussion on|discussion on the|discussion on|conversation with|conversation through call with|please take a look at the|please take a look at|take a look at the|take a look at|take a look)\s+/i, '');
  stripped = stripped.replace(/\s+(based on the new project|based on the|based on|regarding|about)\s+.*/i, '');
  
  stripped = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  const sentence = stripped.split(/[.!?\n]/)[0].trim();
  const words = sentence.split(/\s+/);
  if (words.length > 5) {
    return words.slice(0, 5).join(' ') + '...';
  }
  return sentence;
}

/**
 * Generates a short task header/title from a full description using Gemini or rule-based fallback.
 */
export async function generateTaskHeader(text) {
  if (!text || text.trim() === '') {
    return 'Task Assignment';
  }

  if (!genAI) {
    return localGenerateTaskHeader(text);
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const prompt = `
      You are an AI assistant that generates concise, professional activity titles for an enterprise CRM activity log.

      Your task is to summarize the activity description into a clear, meaningful title.

      Rules:
      - Generate a title containing 3 to 6 words.
      - Use Title Case.
      - Focus on the primary action or outcome.
      - Start with an action verb when appropriate (e.g., Reviewed, Updated, Created, Fixed, Discussed, Implemented, Verified).
      - Do not include employee names, customer names, company names, dates, times, or unnecessary details.
      - Do not use punctuation unless absolutely necessary.
      - Avoid generic titles like "Task Completed" or "Work Update".
      - Return ONLY the title. Do not include explanations, quotes, markdown, or extra text.

      Activity Description:
      ${text}
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let headerText = response.text().trim();
    
    // Clean any surrounding quotes or markdown
    headerText = headerText.replace(/^["']|["']$/g, '').trim();
    
    return headerText || localGenerateTaskHeader(text);
  } catch (error) {
    console.error('Gemini AI call failed for generating task header, using local fallback:', error.message);
    return localGenerateTaskHeader(text);
  }
}

