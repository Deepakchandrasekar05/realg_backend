import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import mysql from "mysql2";

// Initialize Express
const app = express();
app.use(cors());
app.use(bodyParser.json());

// ============================
// 🗄️ IN-MEMORY STORAGE (For Alerts)
// ============================
let latestAlert = null;
let latestGPS = null;
let fenceDetected = false;
const alertsHistory = [];
const MAX_ALERTS_HISTORY = 100;

// ============================
// 🗃️ MYSQL CONNECTION (For Attendance)
// ============================
const db = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,
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
// 🏠 BASIC ENDPOINTS
// ============================
app.get('/', (req, res) => {
  res.send('Backend is live!');
});

app.get("/api/dbtest", (req, res) => {
  db.query("SELECT 1", (err, results) => {
    if (err) return res.status(500).json({ error: "DB test failed" });
    res.json({ success: true });
  });
});

// ============================
// 👥 ATTENDANCE ENDPOINTS
// ============================
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

app.post("/api/attendance", (req, res) => {
  const { uid, name } = req.body;

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
app.post("/api/alert", (req, res) => {
  const { device_id, lat, lon } = req.body;

  if (!device_id || !lat || !lon) {
    return res.status(400).json({ error: "Missing device_id, lat, or lon" });
  }

  const newAlert = {
    type: "SOS",
    device_id,
    lat,
    lon,
    timestamp: new Date().toISOString()
  };

  latestAlert = newAlert;
  alertsHistory.unshift(newAlert);
  if (alertsHistory.length > MAX_ALERTS_HISTORY) {
    alertsHistory.pop();
  }

  console.log(`🚨 SOS ALERT received:`, newAlert);
  res.json({ message: "Alert received", alert: newAlert });
});

app.get("/api/alert", (req, res) => {
  res.json({ 
    alert: latestAlert || null,
    message: latestAlert ? "Active alert" : "No active alerts"
  });
});

app.post("/api/alert/clear", (req, res) => {
  latestAlert = null;
  res.json({ message: "Alert cleared" });
});

// ============================
// 📍 GPS LOCATION ENDPOINTS
// ============================
app.post("/api/gps", (req, res) => {
  const { gps } = req.body;

  if (!gps) {
    return res.status(400).json({ error: "GPS data is required" });
  }

  latestGPS = gps;
  console.log(`📍 GPS Location updated: ${latestGPS}`);
  res.json({ message: "GPS stored successfully" });
});

app.get("/api/gps", (req, res) => {
  res.json({ gps: latestGPS || null });
});

// ============================
// 🚧 GEOFENCE ENDPOINTS
// ============================
app.post('/api/fence/breach', (req, res) => {
  const { device_id, lat, lon } = req.body;
  
  fenceDetected = true;
  
  const newAlert = {
    type: "GEOFENCE",
    device_id: device_id || "unknown",
    lat: lat || null,
    lon: lon || null,
    timestamp: new Date().toISOString()
  };

  alertsHistory.unshift(newAlert);
  if (alertsHistory.length > MAX_ALERTS_HISTORY) {
    alertsHistory.pop();
  }

  console.log(`🚧 GEOFENCE BREACH detected:`, newAlert);
  res.status(200).json({ success: true });
});

app.get('/api/fence', (req, res) => {
  res.json({ breach: fenceDetected });
});

app.post('/api/fence/clear', (req, res) => {
  fenceDetected = false;
  res.status(200).json({ success: true });
});

// ============================
// 📜 ALERTS HISTORY ENDPOINTS
// ============================
app.get("/api/alerts/history", (req, res) => {
  res.json(alertsHistory);
});

app.delete("/api/alerts/history", (req, res) => {
  alertsHistory.length = 0;
  res.json({ message: "Alerts history cleared" });
});

// ============================
// 🚀 SERVER INIT
// ============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🌐 Backend server running on http://localhost:${PORT}`)
);
