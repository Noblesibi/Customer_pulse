import { db } from '../config/database.js';
import { computeAccountSignals } from './signalCalculator.service.js';
import { NotificationEngine } from './notification/NotificationEngine.js';

/**
 * Normalizes severity to numerical weight for roll-ups.
 */
function getSeverityWeight(severity) {
  switch (severity?.toLowerCase()) {
    case 'critical': return 4;
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 0;
  }
}

/**
 * Returns severity name by weight.
 */
function getSeverityName(weight) {
  if (weight >= 4) return 'Critical';
  if (weight === 3) return 'High';
  if (weight === 2) return 'Medium';
  if (weight === 1) return 'Low';
  return 'None';
}

/**
 * Risk Engine: Evaluates risk rules, creates/updates/resolves flags, and rolls up Account Risk Level.
 */
export async function runRiskEngine(accountId) {
  try {
    // 1. Fetch current signals
    const signals = await computeAccountSignals(accountId);
    
    // Calculate score trend (e.g. drop in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const historySnapshot = await db.collection('account_scores_history')
      .where('account_id', '==', accountId)
      .get();
    
    const history = historySnapshot.docs.map(d => d.data())
      .sort((a, b) => new Date(b.calculated_at) - new Date(a.calculated_at)); // newest first
      
    let scoreTrend = 0;
    if (history.length > 0) {
      const currentScore = history[0].score;
      // Find oldest score within 30 days window, or the oldest one available
      const recentHistory = history.filter(h => new Date(h.calculated_at) >= thirtyDaysAgo);
      if (recentHistory.length > 0) {
        const oldestRecentScore = recentHistory[recentHistory.length - 1].score;
        scoreTrend = currentScore - oldestRecentScore;
      }
    }
    signals['score_trend_30d'] = scoreTrend; // E.g., -15 means score dropped by 15 points

    // 2. Fetch the active profile for risk rules
    const profilesSnapshot = await db.collection('scoring_profiles')
      .where('scope', '==', 'ORG')
      .get();
      
    let activeProfile = null;
    if (profilesSnapshot.docs.length > 0) {
      activeProfile = profilesSnapshot.docs[0].data();
    }
    
    if (!activeProfile) {
      console.warn(`No active profile found for risk engine.`);
      return;
    }

    // 3. Fetch Risk Rules
    const rulesSnapshot = await db.collection('risk_rules')
      .where('profile_id', '==', activeProfile.id)
      .get();
    let rules = rulesSnapshot.docs.map(d => d.data());
    rules = rules.filter(r => r.enabled !== false);
    
    // 4. Fetch existing Active Flags
    const activeFlagsSnapshot = await db.collection('risk_flags')
      .where('account_id', '==', accountId)
      .get();
    const activeFlags = activeFlagsSnapshot.docs
      .map(d => ({ ...d.data(), id: d.id }))
      .filter(f => ['active', 'acknowledged', 'snoozed'].includes(f.status));
      
    const activeFlagRuleIds = activeFlags.map(f => f.rule_id);
    const flagsToCreate = [];
    const flagsToResolve = [];

    // 5. Evaluate Risk Rules
    const triggeredRuleIds = new Set();
    
    rules.forEach(rule => {
      // rule.conditions is JSON, simplified structure: 
      // { "signal": "signal_name", "operator": ">", "value": 10 }
      const cond = rule.conditions;
      let isTriggered = false;
      
      if (cond && cond.signal) {
        const signalValue = signals[cond.signal] !== undefined ? signals[cond.signal] : 0;
        switch (cond.operator) {
          case '>': isTriggered = signalValue > cond.value; break;
          case '<': isTriggered = signalValue < cond.value; break;
          case '>=': isTriggered = signalValue >= cond.value; break;
          case '<=': isTriggered = signalValue <= cond.value; break;
          case '==': isTriggered = signalValue == cond.value; break;
        }
      }

      if (isTriggered) {
        triggeredRuleIds.add(rule.id);
        // Create new flag if it doesn't exist
        if (!activeFlagRuleIds.includes(rule.id)) {
          flagsToCreate.push({
            account_id: accountId,
            rule_id: rule.id,
            severity: rule.severity,
            reason: `Triggered by ${cond.signal} (Current value: ${signals[cond.signal]})`,
            recommended_action: rule.recommended_action || 'Review account.',
            status: 'active',
            created_at: new Date().toISOString()
          });
        }
      }
    });

    // 6. Auto-resolve flags that are no longer triggered
    activeFlags.forEach(flag => {
      if (!triggeredRuleIds.has(flag.rule_id)) {
        flagsToResolve.push(flag.id);
      }
    });

    // 7. Apply DB Updates
    for (const flagData of flagsToCreate) {
      await db.collection('risk_flags').add(flagData);
      
      // Attempt to resolve account owner
      let ownerId = null;
      let companyName = 'Unknown Account';
      const accountDoc = await db.collection('accounts').doc(accountId).get();
      if (accountDoc.exists) {
        ownerId = accountDoc.data().ownerId;
        companyName = accountDoc.data().companyName;
      }
      
      if (ownerId) {
        try {
          await NotificationEngine.publishEvent('risk_flag_triggered', {
            CompanyName: companyName,
            RiskCategory: flagData.reason,
            Severity: flagData.severity,
            RecommendedAction: flagData.recommended_action,
            InAppMessage: `New ${flagData.severity} risk flag on ${companyName}: ${flagData.reason}`
          }, [ownerId], { relatedAccountId: accountId });
        } catch (err) {
          console.error('[RiskEngine] Failed to send flag notification', err);
        }
      }
    }
    
    for (const flagId of flagsToResolve) {
      await db.collection('risk_flags').doc(flagId).update({
        status: 'resolved',
        resolved_at: new Date().toISOString()
      });
    }

    // 8. Roll-up overall Account Risk Level
    // Highest severity among active (including newly created, excluding resolved)
    let maxWeight = 0;
    const finalActiveFlags = [
      ...activeFlags.filter(f => !flagsToResolve.includes(f.id)),
      ...flagsToCreate
    ];
    
    finalActiveFlags.forEach(f => {
      const w = getSeverityWeight(f.severity);
      if (w > maxWeight) maxWeight = w;
    });
    
    // Escalation logic: If >= 3 flags or score drop >= 20, escalate by 1
    if (finalActiveFlags.length >= 3 || scoreTrend <= -20) {
      maxWeight = Math.min(4, maxWeight + 1);
    }
    
    const overallRiskLevel = getSeverityName(maxWeight);
    
    const accountRef = db.collection('accounts').doc(accountId);
    const accountDoc = await accountRef.get();
    if (accountDoc.exists) {
      const currentRisk = accountDoc.data().riskLevel;
      const ownerId = accountDoc.data().ownerId;
      const companyName = accountDoc.data().companyName;
      
      await accountRef.update({
        riskLevel: overallRiskLevel,
        scoreTrend: scoreTrend
      });
      
      if (currentRisk !== overallRiskLevel) {
        if (ownerId) {
          try {
            await NotificationEngine.publishEvent('account_risk_level_changed', {
              CompanyName: companyName,
              PreviousRiskLevel: currentRisk || 'None',
              NewRiskLevel: overallRiskLevel,
              Reasons: finalActiveFlags.map(f => f.reason).filter(Boolean),
              RecommendedAction: finalActiveFlags.find(f => f.recommended_action)?.recommended_action || '',
              AccountId: accountId,
              InAppMessage: `Account risk level for ${companyName} changed from ${currentRisk || 'None'} to ${overallRiskLevel}`
            }, [ownerId], { relatedAccountId: accountId });
          } catch (err) {
            console.error('[RiskEngine] Failed to send risk level notification', err);
          }
        }
      }
    }

    return {
      riskLevel: overallRiskLevel,
      activeFlagsCount: finalActiveFlags.length,
      flagsCreated: flagsToCreate.length,
      flagsResolved: flagsToResolve.length
    };

  } catch (error) {
    console.error(`Error in risk engine for account ${accountId}:`, error);
    return null;
  }
}
