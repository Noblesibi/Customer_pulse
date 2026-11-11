/**
 * teamsTranscriptParser.js
 *
 * High-precision WebVTT and plain-text transcript parser for Microsoft Teams meetings.
 * Handles:
 *  - Standard Microsoft Teams WebVTT (<v Speaker Name>Speech...</v>)
 *  - Numbered cue blocks with timestamp arrows (00:00:01.000 --> 00:00:04.500)
 *  - Speaker-prefixed plain dialogues (Speaker: text)
 *  - Consecutive utterance merging for the same speaker
 *  - Clean text compilation for AI sentiment & risk analysis
 *  - Structured JSON dialogues for frontend timeline and drawer inspection
 */

function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts VTT timestamp string (HH:MM:SS.mmm or MM:SS.mmm) to total seconds.
 */
export function timeStringToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }
  if (parts.length === 2) {
    const minutes = parseFloat(parts[0]) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return minutes * 60 + seconds;
  }
  return 0;
}

/**
 * Formats seconds into human-readable MM:SS or HH:MM:SS.
 */
export function secondsToDisplayTime(sec) {
  const totalSec = Math.floor(sec || 0);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (hours > 0) {
    const hh = String(hours).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Parses raw WebVTT or plain transcript text into structured cues.
 *
 * @param {string} rawContent Raw VTT or text from Microsoft Graph API
 * @returns {Object} { cues: Array, speakers: Array, cleanFullText: string, durationSeconds: number, wordCount: number }
 */
export function parseTeamsTranscript(rawContent) {
  if (!rawContent || typeof rawContent !== 'string' || !rawContent.trim()) {
    return {
      cues: [],
      speakers: [],
      cleanFullText: '',
      durationSeconds: 0,
      wordCount: 0
    };
  }

  const normalized = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  const rawCues = [];
  let currentStart = null;
  let currentEnd = null;
  let currentSpeaker = null;
  let currentLines = [];

  const timestampRegex = /((?:\d{2}:)?\d{2}:\d{2}(?:\.\d{3})?)\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}(?:\.\d{3})?)/;

  const flushCue = () => {
    if ((currentStart !== null || currentSpeaker) && currentLines.length > 0) {
      const combined = currentLines.join(' ');
      const cleaned = cleanText(combined);
      if (cleaned.length > 0) {
        rawCues.push({
          startSeconds: currentStart !== null ? currentStart : 0,
          endSeconds: currentEnd !== null ? currentEnd : 0,
          timeDisplay: secondsToDisplayTime(currentStart !== null ? currentStart : 0),
          speaker: currentSpeaker || 'Participant',
          text: cleaned
        });
      }
    }
    currentStart = null;
    currentEnd = null;
    currentSpeaker = null;
    currentLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip WEBVTT header, NOTE blocks, or empty lines
    if (!line || line.startsWith('WEBVTT') || line.startsWith('NOTE') || line.startsWith('REGION')) {
      if (!line && currentLines.length > 0) {
        flushCue();
      }
      continue;
    }

    // Check for timestamp line (e.g. 00:01:23.456 --> 00:01:28.910)
    const timeMatch = line.match(timestampRegex);
    if (timeMatch) {
      flushCue();
      currentStart = timeStringToSeconds(timeMatch[1]);
      currentEnd = timeStringToSeconds(timeMatch[2]);
      continue;
    }

    // Check for cue numbers (e.g. single integer on line before timestamp)
    if (/^\d+$/.test(line) && i + 1 < lines.length && timestampRegex.test(lines[i + 1])) {
      flushCue();
      continue;
    }

    // Check for <v Speaker Name> tag
    const vTagMatch = line.match(/<v\s+([^>]+)>([\s\S]*)/i);
    if (vTagMatch) {
      currentSpeaker = cleanText(vTagMatch[1]);
      const contentAfterV = vTagMatch[2].replace(/<\/v>/gi, '').trim();
      if (contentAfterV) {
        currentLines.push(contentAfterV);
      }
      continue;
    }

    // Check for Speaker: Text prefix (e.g. "John Smith: Thank you all")
    const speakerPrefixMatch = line.match(/^([A-Za-z\s.'-]{2,40}):\s*(.*)$/);
    if (speakerPrefixMatch && !currentSpeaker) {
      currentSpeaker = speakerPrefixMatch[1].trim();
      if (speakerPrefixMatch[2]) {
        currentLines.push(speakerPrefixMatch[2].trim());
      }
      continue;
    }

    // Regular dialogue text line
    const cleanLine = line.replace(/<\/v>/gi, '').trim();
    if (cleanLine) {
      currentLines.push(cleanLine);
    }
  }

  flushCue();

  // If no VTT timestamps were found, parse as line-by-line dialogue
  if (rawCues.length === 0 && lines.length > 0) {
    let fallbackSpeaker = 'Participant';
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const colonMatch = line.match(/^([A-Za-z\s.'-]{2,40}):\s*(.*)$/);
      if (colonMatch) {
        fallbackSpeaker = colonMatch[1].trim();
        const text = cleanText(colonMatch[2]);
        if (text) {
          rawCues.push({
            startSeconds: 0,
            endSeconds: 0,
            timeDisplay: '00:00',
            speaker: fallbackSpeaker,
            text
          });
        }
      } else {
        const text = cleanText(line);
        if (text) {
          rawCues.push({
            startSeconds: 0,
            endSeconds: 0,
            timeDisplay: '00:00',
            speaker: fallbackSpeaker,
            text
          });
        }
      }
    }
  }

  // Merge consecutive cues from the same speaker
  const mergedCues = [];
  for (const cue of rawCues) {
    if (mergedCues.length > 0) {
      const prev = mergedCues[mergedCues.length - 1];
      // Merge if same speaker and within 8 seconds
      if (prev.speaker === cue.speaker && (cue.startSeconds - prev.endSeconds <= 8)) {
        prev.text = `${prev.text} ${cue.text}`;
        prev.endSeconds = Math.max(prev.endSeconds, cue.endSeconds);
        continue;
      }
    }
    mergedCues.push({ ...cue });
  }

  // Extract unique speakers
  const speakersSet = new Set();
  mergedCues.forEach(c => {
    if (c.speaker && c.speaker !== 'Participant') {
      speakersSet.add(c.speaker);
    }
  });

  // Calculate duration
  let maxDuration = 0;
  if (mergedCues.length > 0) {
    maxDuration = mergedCues[mergedCues.length - 1].endSeconds || 0;
  }

  // Compile clean text for AI prompts
  const cleanFullText = mergedCues
    .map(c => `[${c.timeDisplay}] ${c.speaker}: ${c.text}`)
    .join('\n');

  const totalWords = cleanFullText.split(/\s+/).filter(Boolean).length;

  return {
    cues: mergedCues,
    speakers: Array.from(speakersSet),
    cleanFullText,
    durationSeconds: Math.round(maxDuration),
    wordCount: totalWords
  };
}

