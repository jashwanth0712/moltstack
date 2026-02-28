const express = require('express');
const store = require('./store');

const app = express();
app.use(express.json());

const API_KEY = process.env.LINK_MANAGER_API_KEY;
const PORT = process.env.PORT || 3100;
const WALLET_ADDRESS = process.env.WALLET_ADDRESS || 'not-configured';

// ---------------------------------------------------------------------------
// Auth middleware — Bearer token check
// ---------------------------------------------------------------------------
function authMiddleware(req, res, next) {
  if (!API_KEY) {
    return res.status(500).json({ error: 'LINK_MANAGER_API_KEY not configured' });
  }
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${API_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ---------------------------------------------------------------------------
// POST /api/v1/solutions — Store a new solution
// ---------------------------------------------------------------------------
app.post('/api/v1/solutions', authMiddleware, (req, res) => {
  try {
    const { preview, full_solution } = req.body;
    if (!preview || !full_solution) {
      return res.status(400).json({ error: 'preview and full_solution required' });
    }
    if (!preview.title || !preview.problem_summary) {
      return res.status(400).json({ error: 'preview.title and preview.problem_summary required' });
    }

    const solution = store.create({ preview, full_solution });

    res.status(201).json({
      id: solution.id,
      preview_url: `/api/v1/solutions/${solution.id}/preview`,
      created_at: solution.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/solutions/:id/preview — Free preview (no auth)
// ---------------------------------------------------------------------------
app.get('/api/v1/solutions/:id/preview', (req, res) => {
  try {
    const solution = store.findById(req.params.id);
    if (!solution) {
      return res.status(404).json({ error: 'Solution not found' });
    }

    res.json({
      id: solution.id,
      ...solution.preview,
      price: { amount: 100, currency: 'SURGE' },
      unlock_url: `/api/v1/solutions/${solution.id}/unlock`,
      payment_count: solution.payments.length,
      created_at: solution.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/solutions/:id/unlock — Pay SURGE to get full solution
// ---------------------------------------------------------------------------
app.post('/api/v1/solutions/:id/unlock', (req, res) => {
  try {
    const { tx_hash, buyer_agent } = req.body;
    if (!tx_hash || !buyer_agent) {
      return res.status(400).json({ error: 'tx_hash and buyer_agent required' });
    }

    const solution = store.findById(req.params.id);
    if (!solution) {
      return res.status(404).json({ error: 'Solution not found' });
    }

    // Replay protection — reject reused tx hashes
    if (store.txHashUsed(tx_hash)) {
      return res.status(409).json({ error: 'tx_hash already used' });
    }

    // Record payment and return full solution
    store.addPayment(req.params.id, { tx_hash, buyer_agent });

    res.json({
      id: solution.id,
      preview: solution.preview,
      full_solution: solution.full_solution,
      payment: { tx_hash, buyer_agent, amount: 100, currency: 'SURGE' },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/solutions/:id — Full solution if paid, 402 if not
// ---------------------------------------------------------------------------
app.get('/api/v1/solutions/:id', (req, res) => {
  try {
    const solution = store.findById(req.params.id);
    if (!solution) {
      return res.status(404).json({ error: 'Solution not found' });
    }

    const buyerAgent = req.headers['x-agent-id'];
    const hasPaid = buyerAgent && solution.payments.some(p => p.buyer_agent === buyerAgent);

    if (!hasPaid) {
      return res.status(402).json({
        error: 'Payment required',
        price: { amount: 100, currency: 'SURGE' },
        wallet_address: WALLET_ADDRESS,
        unlock_url: `/api/v1/solutions/${solution.id}/unlock`,
        preview: solution.preview,
      });
    }

    res.json({
      id: solution.id,
      preview: solution.preview,
      full_solution: solution.full_solution,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'agent-solutions-link-manager',
    solutions: store.count(),
    uptime: process.uptime(),
  });
});

// ---------------------------------------------------------------------------
// Start server (skip in Vercel — it uses the export)
// ---------------------------------------------------------------------------
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`AgentSolutions Link Manager listening on port ${PORT}`);
  });
}

module.exports = app;
