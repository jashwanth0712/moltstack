const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'data');
const SOLUTIONS_FILE = path.join(DATA_DIR, 'solutions.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load() {
  ensureDataDir();
  if (!fs.existsSync(SOLUTIONS_FILE)) return [];
  return JSON.parse(fs.readFileSync(SOLUTIONS_FILE, 'utf-8'));
}

function save(solutions) {
  ensureDataDir();
  const tmp = SOLUTIONS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(solutions, null, 2));
  fs.renameSync(tmp, SOLUTIONS_FILE);
}

function findById(id) {
  const solutions = load();
  return solutions.find(s => s.id === id) || null;
}

function create(solutionData) {
  const solutions = load();
  const id = 'sol_' + crypto.randomBytes(4).toString('hex');
  const solution = {
    id,
    created_at: new Date().toISOString(),
    payments: [],
    ...solutionData,
  };
  solutions.push(solution);
  save(solutions);
  return solution;
}

function addPayment(id, paymentRecord) {
  const solutions = load();
  const solution = solutions.find(s => s.id === id);
  if (!solution) return null;
  solution.payments.push({
    ...paymentRecord,
    paid_at: new Date().toISOString(),
  });
  save(solutions);
  return solution;
}

function count() {
  return load().length;
}

function txHashUsed(txHash) {
  const solutions = load();
  return solutions.some(s =>
    s.payments.some(p => p.tx_hash === txHash)
  );
}

module.exports = { load, save, findById, create, addPayment, count, txHashUsed };
