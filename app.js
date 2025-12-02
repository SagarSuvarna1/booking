const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3000;

// ----------------------------
// SESSION
// ----------------------------
app.use(session({
  secret: "slot-secret-key",
  resave: false,
  saveUninitialized: true
}));

// ----------------------------
// VIEW ENGINE
// ----------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));

// ----------------------------
// SQLITE DATABASE
// ----------------------------
const db = new sqlite3.Database('booking.db');

// Create table if not exists
db.run(`
  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    date TEXT,
    teacher TEXT,
    className TEXT,
    mobile TEXT,
    period INTEGER,
    time TEXT,
    subject TEXT,
    createdAt TEXT
  )
`);

// ----------------------------
// PERIODS
// ----------------------------
const PERIODS = {
  1: '08:20 - 09:00',
  2: '09:00 - 09:40',
  3: '09:40 - 10:20',
  4: '10:30 - 11:10',
  5: '11:10 - 11:50',
  6: '11:50 - 12:30',
  7: '13:00 - 13:40',
  8: '13:40 - 14:15',
  9: '14:15 - 14:50'
};

// BLOCKING RULES
const BLOCK_MAP = {
  1: [1, 2],
  2: [1, 2, 3],
  3: [2, 3],
  4: [4, 5],
  5: [4, 5, 6],
  6: [5, 6],
  7: [7, 8],
  8: [7, 8, 9],
  9: [8, 9]
};


// ----------------------------
// PIN PROTECTION MIDDLEWARE
// ----------------------------
app.use((req, res, next) => {
  const safe = ["/report-auth", "/report-auth/"];
  
  if (safe.includes(req.path)) return next();

  if (req.path.startsWith("/report")) {
    if (!req.session.allowed) {
      return res.redirect("/report-auth");
    }
  }
  next();
});

// ----------------------------
// HOME PAGE
// ----------------------------
app.get("/", (req, res) => {
  res.render("index", { periods: PERIODS, message: null });
});

// ----------------------------
// BOOK SLOT
// ----------------------------
app.post("/book", (req, res) => {
  const { date, teacher, period, subject, className, mobile } = req.body;
  const p = parseInt(period);

  // Block past dates
  const today = new Date().toISOString().split("T")[0];
  if (date < today) {
    return res.render("index", {
      periods: PERIODS,
      message: {
        type: "error",
        text: "Previous dates are not allowed for booking."
      }
    });
  }

  db.all(`SELECT * FROM bookings WHERE date=?`, [date], (err, rows) => {
    if (err) return res.send("DB ERROR");

    for (const b of rows) {
      if (BLOCK_MAP[b.period].includes(p)) {
        return res.render("index", {
          periods: PERIODS,
          message: {
            type: "error",
            text: `Slot already booked by:
Teacher: ${b.teacher}
Class: ${b.className}
Mobile: ${b.mobile}
Period: ${b.period} (${PERIODS[b.period]})
Subject: ${b.subject}`
          }
        });
      }
    }

    const id = uuidv4();
    const time = PERIODS[p];
    const createdAt = new Date().toISOString();

    db.run(
      `INSERT INTO bookings (id, date, teacher, className, mobile, period, time, subject, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, date, teacher, className, mobile, p, time, subject, createdAt],
      err => {
        if (err) return res.send("DB INSERT ERROR");

        res.render("index", {
          periods: PERIODS,
          message: { type: "success", text: "Slot booked successfully." }
        });
      }
    );
  });
});


// ----------------------------
// AUTH PAGE
// ----------------------------
app.get("/report-auth", (req, res) => {
  res.render("report-auth", { message: null });
});

app.post("/report-auth", (req, res) => {
  if (req.body.pin !== "872243") {
    return res.render("report-auth", {
      message: "Wrong PIN! Contact Sagar - System Admin."
    });
  }

  req.session.allowed = true;
  res.redirect("/report");
});

// ----------------------------
// REPORT PAGE
// ----------------------------
app.get("/report", (req, res) => {
  const { date, day, from, to } = req.query;

  let sql = "SELECT * FROM bookings WHERE 1=1";
  let params = [];

  if (date) {
    sql += " AND date=?";
    params.push(date);
  }

  if (day) {
    sql += " AND strftime('%w', date) = ?";
    const dayMap = {
      Sunday: "0",
      Monday: "1",
      Tuesday: "2",
      Wednesday: "3",
      Thursday: "4",
      Friday: "5",
      Saturday: "6"
    };
    params.push(dayMap[day]);
  }

  if (from && to) {
    sql += " AND date BETWEEN ? AND ?";
    params.push(from, to);
  }

  db.all(sql, params, (err, rows) => {
    if (err) return res.send("DB ERROR");

    res.render("report", {
      list: rows,
      date: date || "",
      day: day || "",
      from: from || "",
      to: to || ""
    });
  });
});

// ----------------------------
// SERVER
// ----------------------------

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on ${PORT}`));