import { db } from '../config/database.js';
import { computeAccountSignals } from './signalCalculator.service.js';
import { NotificationEngine } from './notification/NotificationEngine.js';

/**
 * Normalizes value to 0-100 scale.
 */
function normalizeScore(val, min, max) {
  if (val <= min) return 0;
  if (val >= max) return 100;
  return Math.round(((val - min) / (max - min)) * 100);
}

/**
 * Engine to calculate Account Health Score based on Layered Profiles and Rules.
 */
export async function runScoringEngine(accountId) {
  try {
    // 1. Compute all current signals for the account
    const signals = await computeAccountSignals(accountId);
    
    // 2. Fetch the active profile.
    // For simplicity, we find the first ORG scope profile as default.
    const profilesSnapshot = await db.collection('scoring_profiles')
      .where('scope', '==', 'ORG')
      .get();
      
    let activeProfile = null;
    if (profilesSnapshot.docs.length > 0) {
      activeProfile = profilesSnapshot.docs[0].data();
    }
    
    if (!activeProfile) {
      // Fallback if no profile is defined
      console.warn(`No scoring profile found for ORG. Falling back to default.`);
      return { score: 50, level: 'Amber', breakdown: [] };
    }

    // 3. Fetch rules for the active profile
    const rulesSnapshot = await db.collection('scoring_rules')
      .where('profile_id', '==', activeProfile.id)
      .get();
    let rules = rulesSnapshot.docs.map(d => d.data());
    
    // Filter out disabled rules
    rules = rules.filter(r => r.enabled !== false);
    
    // 4. Fetch Account Overrides
    const overridesDoc = await db.collection('account_scoring_overrides').doc(accountId).get();
    const accountOverrides = overridesDoc.exists ? overridesDoc.data() : null;

    // Apply overrides to rules
    const overriddenRules = rules; // Simplifying for this Phase, manual score takes precedence over rules.

    // 5. Evaluate Rules against Signals
    const categoryScores = {};
    const breakdown = [];
    
    // Initialize category scores
    const weights = activeProfile.category_weights || {};
    Object.keys(weights).forEach(cat => {
      categoryScores[cat] = { pointsAwarded: 0, maxPossible: 0 };
    });

    overriddenRules.forEach(rule => {
      const signalValue = signals[rule.signal] !== undefined ? signals[rule.signal] : 0;
      let isTriggered = false;
      
      switch (rule.operator) {
        case '>': isTriggered = signalValue > rule.threshold_value; break;
        case '<': isTriggered = signalValue < rule.threshold_value; break;
        case '>=': isTriggered = signalValue >= rule.threshold_value; break;
        case '<=': isTriggered = signalValue <= rule.threshold_value; break;
        case '==': isTriggered = signalValue == rule.threshold_value; break;
        case '!=': isTriggered = signalValue != rule.threshold_value; break;
      }

      // We need to keep track of max possible points to normalize later
      // Assuming positive points rules add to maxPossible
      if (!categoryScores[rule.category]) {
        categoryScores[rule.category] = { pointsAwarded: 0, maxPossible: 0 };
      }
      
      if (rule.points > 0) {
        categoryScores[rule.category].maxPossible += rule.points;
      }
      
      if (isTriggered) {
        categoryScores[rule.category].pointsAwarded += rule.points;
        breakdown.push({
          rule_id: rule.id,
          category: rule.category,
          signal: rule.signal,
          signal_value: signalValue,
          points: rule.points,
          reason: `Triggered: ${rule.signal} (${signalValue}) ${rule.operator} ${rule.threshold_value}`
        });
      }
    });

    // 6. Aggregate into Final Score (0-100)
    let finalScoreRaw = 0;
    let totalWeight = 0;
    
    Object.keys(weights).forEach(cat => {
      const weight = weights[cat] || 0;
      const catData = categoryScores[cat] || { pointsAwarded: 0, maxPossible: 0 };
      
      let catScoreNorm = 0;
      if (catData.maxPossible > 0) {
        catScoreNorm = (catData.pointsAwarded / catData.maxPossible) * 100;
        // Cap at 100
        catScoreNorm = Math.min(100, Math.max(0, catScoreNorm));
      } else {
        catScoreNorm = 100; // If no positive rules, default to 100 for this category
      }
      
      finalScoreRaw += (catScoreNorm * (weight / 100));
      totalWeight += weight;
    });

    // If total weight is less than 100 for some reason, normalize it.
    let finalScore = totalWeight > 0 ? Math.round(finalScoreRaw * (100 / totalWeight)) : 50;
    
    // Apply Account Overrides for thresholds if any
    let thresholds = { ...activeProfile.thresholds }; // { green: 70, amber: 40 }

    let level = 'Red';
    if (finalScore >= thresholds.green) level = 'Green';
    else if (finalScore >= thresholds.amber) level = 'Amber';

    // OVERRIDE CHECK
    if (accountOverrides && accountOverrides.manual_score !== undefined) {
      finalScore = parseInt(accountOverrides.manual_score);
      if (finalScore >= thresholds.green) level = 'Green';
      else if (finalScore >= thresholds.amber) level = 'Amber';
      else level = 'Red';
    }

    // 7. Persist to History and Account
    await db.collection('account_scores_history').add({
      account_id: accountId,
      score: finalScore,
      level: level,
      breakdown: breakdown,
      calculated_at: new Date().toISOString()
    });
    
    const accountRef = db.collection('accounts').doc(accountId);
    const accountDoc = await accountRef.get();
    if (accountDoc.exists) {
      const prevHealth = accountDoc.data().healthScore;
      const ownerId = accountDoc.data().ownerId;
      const companyName = accountDoc.data().companyName;

      const newStatus = level === 'Green' ? 'Healthy' : level === 'Amber' ? 'Warning' : 'Critical';

      // Keep old healthScore format, also update riskLevel placeholder if not set
      await accountRef.update({
        healthScore: finalScore,
        status: newStatus,
        scoreBreakdown: breakdown
      });

      // Notify if health score drops by 15 or more points, or changes status
      if (prevHealth !== undefined && finalScore <= prevHealth - 15) {
        if (ownerId) {
          try {
            await NotificationEngine.publishEvent('account_health_dropped', {
              CompanyName: companyName,
              PreviousScore: prevHealth,
              NewScore: finalScore,
              InAppMessage: `Account health for ${companyName} has dropped significantly from ${prevHealth} to ${finalScore}`
            }, [ownerId], { relatedAccountId: accountId });
          } catch (err) {
            console.error('[ScoringEngine] Failed to send health notification', err);
          }
        }
      }
    }

    return {
      score: finalScore,
      level,
      breakdown
    };

  } catch (error) {
    console.error(`Error calculating health score for account ${accountId}:`, error);
    return null;
  }
}
