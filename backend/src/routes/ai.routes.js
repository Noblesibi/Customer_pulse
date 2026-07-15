import { Router } from 'express';
import { generateTaskHeader } from '../services/ai.service.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();
router.use(authenticateToken);

/**
 * POST /api/ai/generate-task-header
 * Expects { description } in the request body.
 * Generates and returns a clean, concise task header.
 */
router.post('/generate-task-header', async (req, res) => {
  const { description } = req.body;
  if (!description) {
    return res.status(400).json({ error: 'Missing description' });
  }

  try {
    const header = await generateTaskHeader(description);
    return res.json({ header });
  } catch (error) {
    console.error('Error generating task header:', error);
    return res.status(500).json({ error: 'Failed to generate task header' });
  }
});

export default router;
