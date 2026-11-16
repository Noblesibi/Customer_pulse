import express from 'express';
import { db } from '../config/database.js';

const router = express.Router();

// --- PROFILES ---
router.get('/profiles', async (req, res) => {
  try {
    const snapshot = await db.collection('scoring_profiles').get();
    res.json(snapshot.docs.map(doc => doc.data()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/profiles', async (req, res) => {
  try {
    const profile = req.body;
    let id = profile.id;
    if (id) {
      await db.collection('scoring_profiles').doc(id).update({
        ...profile,
        updated_at: new Date().toISOString()
      });
    } else {
      const result = await db.collection('scoring_profiles').add({
        ...profile,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      id = result.id;
    }
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SCORING RULES ---
router.get('/rules', async (req, res) => {
  try {
    const profileId = req.query.profileId;
    let snapshot;
    if (profileId) {
      snapshot = await db.collection('scoring_rules').where('profile_id', '==', profileId).get();
    } else {
      snapshot = await db.collection('scoring_rules').get();
    }
    res.json(snapshot.docs.map(doc => doc.data()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rules', async (req, res) => {
  try {
    const rule = req.body;
    let id = rule.id;
    if (id) {
      await db.collection('scoring_rules').doc(id).update(rule);
    } else {
      rule.created_at = new Date().toISOString();
      const result = await db.collection('scoring_rules').add(rule);
      id = result.id;
    }
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- RISK RULES ---
router.get('/risk-rules', async (req, res) => {
  try {
    const profileId = req.query.profileId;
    let snapshot;
    if (profileId) {
      snapshot = await db.collection('risk_rules').where('profile_id', '==', profileId).get();
    } else {
      snapshot = await db.collection('risk_rules').get();
    }
    res.json(snapshot.docs.map(doc => doc.data()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/risk-rules', async (req, res) => {
  try {
    const rule = req.body;
    let id = rule.id;
    if (id) {
      await db.collection('risk_rules').doc(id).update(rule);
    } else {
      rule.created_at = new Date().toISOString();
      const result = await db.collection('risk_rules').add(rule);
      id = result.id;
    }
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CUSTOM SIGNALS ---
router.get('/custom-signals', async (req, res) => {
  try {
    const snapshot = await db.collection('custom_signals').get();
    res.json(snapshot.docs.map(doc => doc.data()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/custom-signals', async (req, res) => {
  try {
    const signal = req.body;
    let id = signal.id;
    if (id) {
      await db.collection('custom_signals').doc(id).update(signal);
    } else {
      signal.created_at = new Date().toISOString();
      const result = await db.collection('custom_signals').add(signal);
      id = result.id;
    }
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/simulate', async (req, res) => {
  try {
    const { rules, weights, thresholds } = req.body;
    
    // Run simulation over real PostgreSQL accounts in database
    const snap = await db.collection('accounts').get();
    const accounts = snap.docs.map(d => d.data());
    const totalAccounts = accounts.length;

    let greenToAmber = 0;
    let amberToRed = 0;
    let redToAmber = 0;
    let amberToGreen = 0;
    let affectedAccounts = 0;

    accounts.forEach(a => {
      const orig = typeof a.healthScore === 'number' ? a.healthScore : 65;
      let simulated = orig;
      if (Array.isArray(rules)) {
        rules.forEach(r => {
          if (r.action === 'subtract') simulated -= (Number(r.points) || 5);
          else if (r.action === 'add') simulated += (Number(r.points) || 5);
        });
      }
      simulated = Math.max(0, Math.min(100, simulated));
      if (simulated !== orig) affectedAccounts++;

      const origBand = orig >= 70 ? 'green' : (orig >= 40 ? 'amber' : 'red');
      const newBand = simulated >= 70 ? 'green' : (simulated >= 40 ? 'amber' : 'red');
      if (origBand === 'green' && newBand === 'amber') greenToAmber++;
      else if (origBand === 'amber' && newBand === 'red') amberToRed++;
      else if (origBand === 'red' && newBand === 'amber') redToAmber++;
      else if (origBand === 'amber' && newBand === 'green') amberToGreen++;
    });

    res.json({
      affectedAccounts,
      totalAccounts,
      transitions: {
        greenToAmber,
        amberToRed,
        redToAmber,
        amberToGreen
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
