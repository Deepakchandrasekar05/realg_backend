import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import mysql from "mysql2";

// Initialize Express
const app = express();
app.use(cors());
app.use(bodyParser.json());

// In-memory storage
let latestAlert= null;
let latestGPS= null;

// MySQL Database Connection with Pooling
const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "password",
  database: "REALG",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Check MySQL Connection
db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ MySQL Connection Failed:", err);
  } else {
    console.log("✅ MySQL Connected...");
    connection.release();
  }
});


// ============================
// 📌 ATTENDANCE ENDPOINTS
// ============================

// Fetch all attendance records
app.get("/api/attendance", (req, res) => {
  const query = "SELECT * FROM attendance";
  db.query(query, (err, results) => {
    if (err) {
      console.error("Database Query Failed:", err);
      return res.status(500).json({ error: "Database query failed" });
    }
    res.json(results);
  });
});

// Add attendance entry
app.post("/api/attendance", (req, res) => {
  const { uid, name} = req.body;

  if (!uid || !name) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const query = "INSERT INTO attendance (uid, name) VALUES (?, ?)";
  db.query(query, [uid, name], (err, result) => {
    if (err) {
      console.error("Database Insert Failed:", err);
      return res.status(500).json({ error: "Failed to insert data" });
    }
    res.json({ message: "Attendance recorded successfully!" });
  });
});


// ============================
// 🚨 SOS ALERT ENDPOINTS
// ============================

// Save alert with GPS
// Save alert with structured LoRa JSON (device_id, lat, lon)
app.post("/api/alert", (req, res) => {
  const { device_id, lat, lon } = req.body;

  if (!device_id || !lat || !lon) {
    return res.status(400).json({ error: "Missing device_id, lat, or lon" });
  }

  latestAlert = { device_id, lat, lon };
  console.log(`🚨 SOS ALERT received:`, latestAlert);

  res.json({ message: "Alert received", alert: latestAlert });
});


// Get latest alert
// Get latest structured alert
app.get("/api/alert", (req, res) => {
  if (!latestAlert) {
    return res.json({ message: "No active alerts currently." });
  }

  res.json({ alert: latestAlert });
});

// Reset latest alert (e.g., after dismiss)
app.delete("/api/alert", (req, res) => {
  latestAlert = null;
  console.log("✅ Alert dismissed by user.");
  res.json({ message: "Alert dismissed successfully" });
});

// Clear alert
app.post("/api/alert/clear", (req, res) => {
  latestAlert = null;
  res.json({ message: "Alert cleared" });
});


// ============================
// 📍 GPS LOCATION ENDPOINTS
// ============================

// Save latest GPS location from ESP32
app.post("/api/gps", (req, res) => {
  const { gps } = req.body;

  if (!gps) {
    return res.status(400).json({ error: "GPS data is required" });
  }

  latestGPS = gps;
  console.log(`📍 GPS Location updated: ${latestGPS}`);
  res.json({ message: "GPS stored successfully" });
});

// Get latest GPS location for map
app.get("/api/gps", (req, res) => {
  res.json({ gps: latestGPS ?? "" });
});


// ============================
// 🚀 SERVER INIT
// ============================

app.listen(3000, "0.0.0.0", () =>
  console.log("🌐 Backend server running on http://localhost:3000")
);
