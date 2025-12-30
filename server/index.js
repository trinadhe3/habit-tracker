import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'habit-tracker';

const DEFAULT_HABITS = [
  { id: 'wake', label: 'Wake up early' },
  { id: 'exercise', label: 'Exercise' },
  { id: 'study', label: 'Study / Learn new skill' },
  { id: 'problems', label: '2 problems a day' },
  { id: 'water', label: 'Drink enough water' },
  { id: 'meditate', label: 'Meditation' },
  { id: 'read', label: 'Reading' },
];

const todayKey = () => new Date().toISOString().slice(0, 10);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const userDataSchema = new mongoose.Schema(
  {
    mobile: { type: String, required: true, unique: true },
    habits: [{ id: String, label: String }],
    history: { type: Object, default: {} },
    tasksByDate: { type: Object, default: {} },
  },
  { timestamps: true, minimize: false }
);

const UserData = mongoose.model('UserData', userDataSchema);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { mobile } = req.body || {};
    if (!mobile) return res.status(400).json({ error: 'Mobile is required' });
    const existing = await UserData.findOne({ mobile }).lean();
    if (existing) return res.status(200).json({ mobile });
    await UserData.create({
      mobile,
      habits: DEFAULT_HABITS,
      history: { [todayKey()]: { habits: {} } },
      tasksByDate: { [todayKey()]: [] },
    });
    return res.status(201).json({ mobile });
  } catch (err) {
    console.error('POST /api/auth/signup failed', err);
    return res.status(500).json({ error: 'Signup failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { mobile } = req.body || {};
    if (!mobile) return res.status(400).json({ error: 'Mobile is required' });
    const doc = await UserData.findOne({ mobile }).lean();
    if (!doc) return res.status(404).json({ error: 'User not found' });
    return res.json({ mobile });
  } catch (err) {
    console.error('POST /api/auth/login failed', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

function requireMobile(req, res, next) {
  const mobile = req.header('x-user-mobile');
  if (!mobile) return res.status(401).json({ error: 'Missing mobile header' });
  req.mobile = mobile;
  return next();
}

app.get('/api/data', requireMobile, async (req, res) => {
  try {
    let doc = await UserData.findOne({ mobile: req.mobile }).lean();
    if (!doc) {
      const seed = {
        mobile: req.mobile,
        habits: DEFAULT_HABITS,
        history: { [todayKey()]: { habits: {} } },
        tasksByDate: { [todayKey()]: [] },
      };
      doc = (await UserData.create(seed)).toObject();
    }
    return res.json({ habits: doc.habits, history: doc.history, tasksByDate: doc.tasksByDate });
  } catch (err) {
    console.error('GET /api/data failed', err);
    return res.status(500).json({ error: 'Failed to load data' });
  }
});

app.post('/api/data', requireMobile, async (req, res) => {
  try {
    const { habits = DEFAULT_HABITS, history = {}, tasksByDate = {} } = req.body || {};
    const update = {
      mobile: req.mobile,
      habits: Array.isArray(habits) && habits.length ? habits : DEFAULT_HABITS,
      history: history || {},
      tasksByDate: tasksByDate || {},
    };
    const doc = await UserData.findOneAndUpdate(
      { mobile: req.mobile },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return res.json({ habits: doc.habits, history: doc.history, tasksByDate: doc.tasksByDate });
  } catch (err) {
    console.error('POST /api/data failed', err);
    return res.status(500).json({ error: 'Failed to save data' });
  }
});

async function start() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is not set. Add it to your .env file.');
    process.exit(1);
  }
  try {
    await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`API server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start();
