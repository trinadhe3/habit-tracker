import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const DEFAULT_HABITS = [
  { id: 'wake', label: 'Wake up early' },
  { id: 'exercise', label: 'Exercise' },
  { id: 'study', label: 'Study / Learn new skill' },
  { id: 'problems', label: '2 problems a day' },
  { id: 'water', label: 'Drink enough water' },
  { id: 'meditate', label: 'Meditation' },
  { id: 'read', label: 'Reading' },
];

const QUOTES = [
  'Small steps daily beat big leaps occasionally.',
  'Discipline is choosing what you want most over what you want now.',
  'Your future self is already thanking you.',
  'Consistency turns goals into habits.',
  'Done is better than perfect.',
  'Tiny victories compound into momentum.',
  'Energy follows focus. Guard it.',
  'Show up. Even for five minutes.',
  'Progress is quiet but powerful.',
  'Momentum is built, not found.',
];

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const todayKey = () => new Date().toISOString().slice(0, 10);

const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const lastNDates = (n) => {
  const dates = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
};

const weekdayLabels = (n) => {
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  return lastNDates(n).map((dateKey) => formatter.format(new Date(dateKey)));
};

export default function App() {
  const [history, setHistory] = useState({ [todayKey()]: { habits: {} } });
  const [habits, setHabits] = useState(DEFAULT_HABITS);
  const [tasksByDate, setTasksByDate] = useState({ [todayKey()]: [] });
  const [isLoaded, setIsLoaded] = useState(false);
  const [mobile, setMobile] = useState(localStorage.getItem('mobileNumber') || '');
  const [mobileInput, setMobileInput] = useState(localStorage.getItem('mobileNumber') || '');
  const [authError, setAuthError] = useState('');
  const saveTimer = React.useRef(null);
  const [newTask, setNewTask] = useState('');
  const [newHabit, setNewHabit] = useState('');
  const [newReminder, setNewReminder] = useState('');
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const reminderTimers = React.useRef({});

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (!mobile) {
        setIsLoaded(true);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/data`, { headers: { 'x-user-mobile': mobile } });
        if (!res.ok) throw new Error('Failed to fetch');
        const json = await res.json();
        if (!isMounted) return;
        setHabits(Array.isArray(json.habits) && json.habits.length ? json.habits : DEFAULT_HABITS);
        setHistory(json.history && Object.keys(json.history).length ? json.history : { [todayKey()]: { habits: {} } });
        setTasksByDate(json.tasksByDate || { [todayKey()]: [] });
      } catch (err) {
        console.error('API load failed', err);
        if (!isMounted) return;
        setHabits(DEFAULT_HABITS);
        setHistory({ [todayKey()]: { habits: {} } });
        setTasksByDate({ [todayKey()]: [] });
      } finally {
        if (isMounted) setIsLoaded(true);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [mobile]);

  useEffect(() => {
    if (!isLoaded || !mobile) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const payload = { habits, history, tasksByDate };
    saveTimer.current = setTimeout(() => {
      fetch(`${API_URL}/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-mobile': mobile },
        body: JSON.stringify(payload),
      }).catch((err) => console.error('Failed to save data', err));
    }, 400);
  }, [habits, history, tasksByDate, isLoaded, mobile]);

  useEffect(() => {
    scheduleReminders(tasksByDate, reminderTimers);
  }, [tasksByDate]);

  const handleAuth = async (mode) => {
    const trimmed = mobileInput.trim();
    if (!trimmed) {
      setAuthError('Enter mobile number');
      return;
    }
    try {
      setAuthError('');
      const res = await fetch(`${API_URL}/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Request failed');
      }
      localStorage.setItem('mobileNumber', trimmed);
      setMobile(trimmed);
      setIsLoaded(false);
    } catch (err) {
      setAuthError(err.message || 'Auth failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('mobileNumber');
    setMobile('');
    setMobileInput('');
    setHabits(DEFAULT_HABITS);
    setHistory({ [todayKey()]: { habits: {} } });
    setTasksByDate({ [todayKey()]: [] });
    setIsLoaded(true);
  };

  const todayHabits = history[todayKey()]?.habits || {};

  const tasksForDate = tasksByDate[selectedDate] || [];
  const tasksCompleted = useMemo(
    () => tasksForDate.filter((t) => t.done).length,
    [tasksForDate]
  );

  const completedCount = useMemo(
    () => habits.filter((h) => todayHabits[h.id]).length,
    [todayHabits, habits]
  );

  const quote = useMemo(() => {
    const idx = (new Date().getDate() + new Date().getMonth()) % QUOTES.length;
    return QUOTES[idx];
  }, []);

  const streak = useMemo(() => calculateStreak(history, habits), [history, habits]);

  const weeklyPercentages = useMemo(() => {
    const days = lastNDates(7);
    return days.map((day) => percentForDay(history[day]?.habits || {}, habits));
  }, [history, habits]);

  const weeklyAverage = useMemo(() => {
    if (!weeklyPercentages.length) return 0;
    return Math.round(
      weeklyPercentages.reduce((sum, val) => sum + val, 0) / weeklyPercentages.length
    );
  }, [weeklyPercentages]);

  const weeklyFullDays = useMemo(
    () => weeklyPercentages.filter((p) => p === 100).length,
    [weeklyPercentages]
  );

  const { bestHabit, worstHabit } = useMemo(() => monthlyInsight(history, habits), [history, habits]);

  const pieData = useMemo(
    () => ({
      labels: ['Completed', 'Remaining'],
      datasets: [
        {
          data: [completedCount, habits.length - completedCount],
          backgroundColor: ['#32c48d', '#d4dae7'],
          borderWidth: 0,
        },
      ],
    }),
    [completedCount, habits.length]
  );

  const barData = useMemo(
    () => ({
      labels: weekdayLabels(7),
      datasets: [
        {
          label: 'Completion %',
          data: weeklyPercentages,
          backgroundColor: '#4f8bff',
          borderRadius: 10,
        },
      ],
    }),
    [weeklyPercentages]
  );

  const barOptions = {
    scales: {
      y: {
        suggestedMax: 100,
        ticks: { callback: (v) => `${v}%` },
        grid: { color: '#eef1f6' },
      },
      x: { grid: { display: false } },
    },
    plugins: { legend: { display: false } },
  };

  const pieOptions = {
    cutout: '60%',
    plugins: { legend: { position: 'bottom' } },
  };

  const handleHabitToggle = (habitId, checked) => {
    setHistory((prev) => {
      const next = { ...prev };
      const current = next[todayKey()] || { habits: {} };
      next[todayKey()] = {
        ...current,
        habits: { ...current.habits, [habitId]: checked },
      };
      return next;
    });
  };

  const handleAddTask = (e) => {
    e.preventDefault();
    const trimmed = newTask.trim();
    if (!trimmed) return;
    setTasksByDate((prev) => {
      const current = prev[selectedDate] || [];
      return {
        ...prev,
        [selectedDate]: [
          { id: makeId(), text: trimmed, done: false, reminderTime: newReminder || '' },
          ...current,
        ],
      };
    });
    setNewTask('');
    setNewReminder('');
  };

  const toggleTask = (id) => {
    setTasksByDate((prev) => {
      const current = prev[selectedDate] || [];
      return {
        ...prev,
        [selectedDate]: current.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      };
    });
  };

  const editTask = (id) => {
    const current = tasksForDate.find((t) => t.id === id);
    if (!current) return;
    const updated = window.prompt('Edit task', current.text);
    if (updated === null) return;
    const text = updated.trim();
    if (!text) return;
    setTasksByDate((prev) => {
      const list = prev[selectedDate] || [];
      return {
        ...prev,
        [selectedDate]: list.map((t) => (t.id === id ? { ...t, text } : t)),
      };
    });
  };

  const deleteTask = (id) => {
    setTasksByDate((prev) => {
      const list = prev[selectedDate] || [];
      return { ...prev, [selectedDate]: list.filter((t) => t.id !== id) };
    });
  };

  const handleDateChange = (value) => {
    if (!value) return;
    setSelectedDate(value);
    setTasksByDate((prev) => ({ ...prev, [value]: prev[value] || [] }));
  };

  const todayLabel = useMemo(() => {
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    return new Date().toLocaleDateString(undefined, options);
  }, []);

  const handleAddHabit = (e) => {
    e.preventDefault();
    const trimmed = newHabit.trim();
    if (!trimmed) return;
    const id = slugify(trimmed);
    if (habits.some((h) => h.id === id)) return;
    setHabits((prev) => [...prev, { id, label: trimmed }]);
    setHistory((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        const entry = next[key] || { habits: {} };
        if (!entry.habits) entry.habits = {};
        entry.habits[id] = false;
        next[key] = entry;
      });
      return next;
    });
    setNewHabit('');
  };

  const handleDeleteHabit = (id) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
    setHistory((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (next[key]?.habits) delete next[key].habits[id];
      });
      return next;
    });
  };

  const handleRenameHabit = (id) => {
    const current = habits.find((h) => h.id === id);
    if (!current) return;
    const updated = window.prompt('Rename habit', current.label);
    if (!updated) return;
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, label: updated.trim() } : h)));
  };

  if (!mobile) {
    return (
      <div className="page auth-page">
        <div className="bg-layer bg-surface" />
        <div className="bg-layer bg-accent" />
        <div className="auth-card">
          <h1>Habit Tracker</h1>
          <p className="muted">Log in or sign up with your mobile number</p>
          <input
            className="auth-input"
            type="tel"
            placeholder="Enter mobile number"
            value={mobileInput}
            onChange={(e) => setMobileInput(e.target.value)}
          />
          {authError && <p className="error-text">{authError}</p>}
          <div className="auth-actions">
            <button type="button" onClick={() => handleAuth('login')}>Login</button>
            <button type="button" className="ghost" onClick={() => handleAuth('signup')}>Sign up</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="bg-layer bg-surface" />
      <div className="bg-layer bg-accent" />

      <header className="top-bar">
        <div>
          <p className="eyebrow">Daily Flow</p>
          <h1>Habit Tracker</h1>
          <p className="sub">Stay consistent with a calm, clear dashboard.</p>
        </div>
        <div className="top-right">
          <motion.div className="streak" initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
            {streak}-day streak
          </motion.div>
          <div className="date">{todayLabel}</div>
          <button type="button" className="ghost" onClick={handleLogout}>Switch number</button>
        </div>
      </header>

      <section className="summary-row">
        <motion.div
          className="summary-card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <p className="label">Habits</p>
          <h3>{completedCount}/{habits.length}</h3>
          <p className="muted">completed today</p>
        </motion.div>
        <motion.div
          className="summary-card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <p className="label">Tasks</p>
          <h3>{tasksCompleted}/{tasksForDate.length || 0}</h3>
          <p className="muted">for {selectedDate}</p>
        </motion.div>
        <motion.div
          className="summary-card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <p className="label">Streak</p>
          <h3>{streak} days</h3>
          <p className="muted">keep the momentum</p>
        </motion.div>
      </section>

      <main className="layout">
        <motion.section
          className="card habits"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className="section-header">
            <div>
              <p className="eyebrow">Daily Rhythm</p>
              <h2>Habits</h2>
            </div>
            <div className="pill" aria-live="polite">
              {completedCount}/{habits.length} done
            </div>
          </div>
          <form className="habit-form" onSubmit={handleAddHabit}>
            <input
              type="text"
              value={newHabit}
              onChange={(e) => setNewHabit(e.target.value)}
              placeholder="Add a habit..."
              aria-label="Add habit"
            />
            <button type="submit">Add</button>
          </form>
          <ul className="habit-list">
            <AnimatePresence>
              {habits.map((habit, idx) => (
                <motion.li
                  key={habit.id}
                  className="habit-item"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ delay: idx * 0.05 }}
                  whileHover={{ y: -2 }}
                >
                  <div className="habit-left">
                    <input
                      type="checkbox"
                      id={habit.id}
                      checked={Boolean(todayHabits[habit.id])}
                      onChange={(e) => handleHabitToggle(habit.id, e.target.checked)}
                    />
                    <label htmlFor={habit.id}>{habit.label}</label>
                  </div>
                  <div className="progress-bar" aria-hidden>
                    <div
                      className="progress-inner"
                      style={{ width: todayHabits[habit.id] ? '100%' : '12%' }}
                    />
                  </div>
                  <div className="habit-actions">
                    <button type="button" className="ghost" onClick={() => handleRenameHabit(habit.id)}>
                      Edit
                    </button>
                    <button type="button" className="ghost danger" onClick={() => handleDeleteHabit(habit.id)}>
                      Remove
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </motion.section>

        <motion.section
          className="card tasks"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="section-header">
            <div>
              <p className="eyebrow">Quick Tasks</p>
              <h2>To-Do Today</h2>
            </div>
            <div className="date-picker">
              <label className="label" htmlFor="taskDate">Date</label>
              <div className="date-picker-row">
                <input
                  id="taskDate"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                />
                <button type="button" className="ghost" onClick={() => handleDateChange(todayKey())}>
                  Today
                </button>
              </div>
            </div>
          </div>
          <form className="task-form" onSubmit={handleAddTask}>
            <input
              type="text"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="Add a task..."
              aria-label="Add task"
            />
            <input
              type="time"
              value={newReminder}
              onChange={(e) => setNewReminder(e.target.value)}
              aria-label="Set reminder time"
            />
            <button type="submit">Add</button>
          </form>
          <ul className="task-list">
            {tasksForDate.length === 0 && <p className="muted">No tasks for this date. Add one above.</p>}
            <AnimatePresence>
              {tasksForDate.map((task) => (
                <motion.li
                  key={task.id}
                  className="task-item"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  layout
                >
                  <div className="task-left">
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => toggleTask(task.id)}
                    />
                    <span className={`task-text ${task.done ? 'done' : ''}`}>{task.text}</span>
                  </div>
                  <div className="task-actions">
                    {task.reminderTime && (
                      <span className="pill tiny">Reminder {task.reminderTime}</span>
                    )}
                    <button type="button" onClick={() => editTask(task.id)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => deleteTask(task.id)}>
                      Delete
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </motion.section>

        <motion.section
          className="card charts"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="section-header">
            <div>
              <p className="eyebrow">Today's Momentum</p>
              <h2>Progress</h2>
            </div>
          </div>
          <div className="chart-grid">
            <div className="chart-block">
              <h3>Completion Split</h3>
              <Doughnut data={pieData} options={pieOptions} />
            </div>
            <div className="chart-block">
              <h3>Last 7 Days</h3>
              <Bar data={barData} options={barOptions} />
            </div>
          </div>
        </motion.section>

        <motion.section
          className="card overview"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="section-header">
            <div>
              <p className="eyebrow">Zoomed Out</p>
              <h2>Weekly & Monthly</h2>
            </div>
          </div>
          <div className="overview-grid">
            <div className="stat">
              <p className="label">Weekly consistency</p>
              <h3>{weeklyAverage}% avg</h3>
              <p className="muted">{weeklyFullDays} of 7 days fully completed.</p>
            </div>
            <div className="stat">
              <p className="label">Monthly insight</p>
              <h3>{bestHabit ? bestHabit.label : '--'}</h3>
              <p className="muted">
                {worstHabit ? `Needs love: ${worstHabit.label}` : 'Log more days to see insights.'}
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="card motivation"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <div className="section-header">
            <div>
              <p className="eyebrow">Keep Going</p>
              <h2>Motivation</h2>
            </div>
          </div>
          <div className="motivation-content">
            <div>
              <p className="label">Today's quote</p>
              <p className="quote">{quote}</p>
            </div>
            <motion.div
              className="pill highlight"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 240, damping: 18 }}
            >
              {streak >= 3 ? `🔥 ${streak} days in a row` : 'Keep stacking reps'}
            </motion.div>
          </div>
        </motion.section>
      </main>
    </div>
  );
}

function percentForDay(habitsMap, habitsList) {
  const total = habitsList?.length || 1;
  const completed = (habitsList || []).filter((h) => habitsMap[h.id]).length;
  return Math.round((completed / total) * 100);
}

function calculateStreak(history, habits) {
  let streak = 0;
  let cursor = new Date();
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    const record = history[key];
    if (!record) break;
    const percent = percentForDay(record.habits || {}, habits);
    if (percent === 100) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function monthlyInsight(history, habits) {
  const days = lastNDates(30);
  const counts = habits.reduce((acc, h) => ({ ...acc, [h.id]: 0 }), {});
  days.forEach((day) => {
    const record = history[day];
    if (!record) return;
    habits.forEach((h) => {
      if (record.habits?.[h.id]) counts[h.id] += 1;
    });
  });
  const entries = Object.entries(counts);
  if (!entries.length) return { bestHabit: null, worstHabit: null };
  const best = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const worst = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
  return {
    bestHabit: habits.find((h) => h.id === best[0]) || null,
    worstHabit: habits.find((h) => h.id === worst[0]) || null,
  };
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 30) || `habit-${Date.now()}`;
}

function scheduleReminders(tasksByDate, ref) {
  Object.values(ref.current).forEach(clearTimeout);
  ref.current = {};
  const now = Date.now();
  Object.entries(tasksByDate).forEach(([date, list]) => {
    list.forEach((task) => {
      if (!task.reminderTime) return;
      const due = new Date(`${date}T${task.reminderTime}`);
      const delay = due.getTime() - now;
      if (delay <= 0) return;
      const id = setTimeout(() => triggerReminder(task), delay);
      ref.current[task.id] = id;
    });
  });
}

function triggerReminder(task) {
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification('Task reminder', { body: task.text });
      return;
    }
    if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') new Notification('Task reminder', { body: task.text });
        else alert(`Reminder: ${task.text}`);
      });
      return;
    }
  }
  alert(`Reminder: ${task.text}`);
}
