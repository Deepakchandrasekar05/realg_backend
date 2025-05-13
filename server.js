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

let fenceDetected= false;
const alertsHistory = [];
const MAX_ALERTS_HISTORY = 100;

// MySQL Database Connection with Pooling
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

app.get("/api/dbtest", (req, res) => {
  db.query("SELECT 1", (err, results) => {
    if (err) return res.status(500).json({ error: "DB test failed" });
    res.json({ success: true });
  });
});

app.get('/', (req, res) => {
  res.send('Backend is live!');
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
// Update the attendance endpoint
// Update the attendance endpoint to prevent duplicates
// Update the attendance endpoint with comprehensive duplicate prevention
app.post("/api/attendance", async (req, res) => {
  const { uid, name } = req.body;

  if (!uid || !name) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // 1. First check for any entry with this UID in the last 5 minutes
    const recentCheckQuery = `
      SELECT id, timestamp 
      FROM attendance 
      WHERE uid = ? 
      AND timestamp > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
      ORDER BY timestamp DESC 
      LIMIT 1
    `;

    const [recentResults] = await db.promise().query(recentCheckQuery, [uid]);

    if (recentResults.length > 0) {
      return res.json({
        message: "Duplicate scan prevented",
        lastScan: recentResults[0].timestamp,
        cooldown: "Please wait 5 minutes between scans"
      });
    }

    // 2. If no recent scan, either update or insert
    const updateQuery = `
      INSERT INTO attendance (uid, name, timestamp)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE timestamp = NOW()
    `;

    const [result] = await db.promise().query(updateQuery, [uid, name]);

    if (result.affectedRows === 1) {
      if (result.insertId) {
        // New record was inserted
        return res.json({ message: "New attendance recorded successfully!" });
      } else {
        // Existing record was updated
        return res.json({ message: "Attendance timestamp updated successfully!" });
      }
    }

    return res.status(500).json({ error: "Failed to record attendance" });

  } catch (err) {
    console.error("Database Error:", err);
    return res.status(500).json({ error: "Database operation failed" });
  }
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


// Get latest alert
// Get latest structured alert
app.get("/api/alert", (req, res) => {
  if (!latestAlert) {
    return res.json({ message: "No active alerts currently." });
  }

  res.json({ alert: latestAlert });
});

// Reset latest alert (e.g., after dismiss)




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


app.get("/api/alerts/history", (req, res) => {
    res.json(alertsHistory);
  });
  
  app.delete("/api/alerts/history", (req, res) => {
    alertsHistory.length = 0;
    res.json({ message: "Alerts history cleared" });
  });

// Add these new endpoints:

// Get all attendance records with latest timestamp only
app.get("/api/attendance/latest", (req, res) => {
  const query = `
    SELECT a.* FROM attendance a
    INNER JOIN (
      SELECT uid, MAX(timestamp) as latest_timestamp 
      FROM attendance 
      GROUP BY uid
    ) b ON a.uid = b.uid AND a.timestamp = b.latest_timestamp
    ORDER BY a.timestamp DESC
  `;
  db.query(query, (err, results) => {
    if (err) {
      console.error("Database Query Failed:", err);
      return res.status(500).json({ error: "Database query failed" });
    }
    res.json(results);
  });
});

// Get all timestamps for a specific UID
app.get("/api/attendance/history/:uid", (req, res) => {
  const { uid } = req.params;
  const query = "SELECT * FROM attendance WHERE uid = ? ORDER BY timestamp DESC";
  db.query(query, [uid], (err, results) => {
    if (err) {
      console.error("Database Query Failed:", err);
      return res.status(500).json({ error: "Database query failed" });
    }
    res.json(results);
  });
});

// ============================
// 🚀 SERVER INIT
// ============================

app.listen(3000, "0.0.0.0", () =>
  console.log("🌐 Backend server running on http://localhost:3000")
);

