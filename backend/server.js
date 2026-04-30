require("dotenv").config({
  path: require("path").resolve(__dirname, ".env")
});
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";
const frontendDir = path.resolve(__dirname, "../frontend");
const localOrigins = [
  "http://127.0.0.1:5500",
  "http://localhost:5000",
  "http://127.0.0.1:5501",
  "http://localhost:5501",
  "http://192.168.101.113:5000",
  "http://192.168.101.251:5500"
];

const configuredOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  ...localOrigins,
  "https://trackmyrent.co.za",
  "https://www.trackmyrent.co.za",
  ...configuredOrigins
]);
require("./cron");
const cron = require("node-cron");
const {
  detectLateRent,
  detectLeaseExpiry,
  detectMissingLease
} = require("./services/dailyNotificationChecks");
const startLateFeeScheduler = require("./services/lateFeeScheduler");
const adminRoutes = require("./routes/admin");
const subscriptionRoutes = require("./routes/subscription");
const sendRentReminders = require("./services/rentReminderService");
/* ======================================================
   MIDDLEWARE
====================================================== */
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

app.use(morgan("dev"));
app.use(express.json());
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  if (isProduction) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  next();
});

/* ======================================================
   STATIC FILES
====================================================== */
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);
app.use(express.static(frontendDir));

/* ======================================================
   ROUTE IMPORTS – CORE
   (ALL COMMONJS – SAFE)
====================================================== */
const authRoutes = require("./routes/auth");
const propertyRoutes = require("./routes/properties");
const unitRoutes = require("./routes/units");
const tenantRoutes = require("./routes/tenants");
const leaseRoutes = require("./routes/leases");

const dashboardRoutes = require("./routes/dashboard");
const notificationRoutes = require("./routes/notifications");
const maintenanceRoutes = require("./routes/maintenance");
const aiRoutes = require("./routes/ai");
const tutorialRoutes = require("./routes/tutorials");
const startRentScheduler = require("./services/rentScheduler");
startRentScheduler();
/* ======================================================
   ROUTE IMPORTS – FINANCIAL (LEDGER IS SOURCE OF TRUTH)
====================================================== */
const ledgerRoutes = require("./routes/ledger.routes");
const utilitiesRoutes = require("./routes/utilities");
const damagesRoutes = require("./routes/damages.routes");
const summariesRoutes = require("./routes/summaries.routes");
const bankImportRoutes = require("./routes/bankImports");

/* ======================================================
   ROUTE IMPORTS – REPORTS & SETTINGS
====================================================== */
const reportsRoutes = require("./routes/reports.routes");
const businessSettingsRoutes = require("./routes/businessSettings");
const uploadLogoRoutes = require("./routes/uploadLogo");
const settingsRoutes = require("./routes/financial-settings");
/* ======================================================
   API ROUTES – CORE
====================================================== */
app.use("/api/auth", authRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api/units", unitRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/leases", leaseRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/tutorials", tutorialRoutes);
app.use("/api/invoices", require("./routes/invoice.routes"));
app.use("/api/admin", adminRoutes);
app.use("/api/subscription", subscriptionRoutes);

/* ======================================================
   API ROUTES – FINANCIAL (NO DUPLICATES)
====================================================== */
app.use("/api/ledger", ledgerRoutes);
app.use("/api/utilities", utilitiesRoutes);
app.use("/api/damages", damagesRoutes);
app.use("/api/summaries", summariesRoutes);
app.use("/api/expenses", require("./routes/expenses"));
app.use("/api/bank-import", bankImportRoutes);

/* ======================================================
   API ROUTES – REPORTS & SETTINGS
====================================================== */
app.use("/api/reports", reportsRoutes);
app.use("/api/business-settings", businessSettingsRoutes);
app.use("/api", uploadLogoRoutes);
app.use("/api/financial-settings", settingsRoutes);



/* ======================================================
   HEALTH CHECK
====================================================== */
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.get("/healthz", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "track-my-rent",
    uptime: process.uptime()
  });
});

app.get("/api/healthz", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "track-my-rent-api",
    uptime: process.uptime()
  });
});

/* ======================================================
   GLOBAL ERROR HANDLER (OPTIONAL BUT STRONG)
====================================================== */
app.use((err, req, res, next) => {
  console.error("❌ UNHANDLED ERROR:", err);
  res.status(500).json({
    message: "Internal server error"
  });
});

app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});


cron.schedule("0 2 * * *", async () => {
  console.log("Running daily notification checks...");
  await detectLateRent();
  await detectLeaseExpiry();
  await detectMissingLease();
});

cron.schedule("0 8 * * *", async () => {
  console.log("Running daily rent reminders...");
  await sendRentReminders();
});
/* ======================================================
   DATABASE + SERVER START
====================================================== */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ DB Connection Error:", err.message);
    process.exit(1);
  });
  
mongoose.connection.once("open", () => {
  startLateFeeScheduler();
});

