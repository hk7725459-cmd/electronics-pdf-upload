const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_KEY = process.env.DEVELOPER_KEY || "change-this-secret-key";
const rootDir = __dirname;
const uploadsDir = path.join(rootDir, "uploads");
const dataDir = path.join(rootDir, "data");
const metadataFile = path.join(dataDir, "files.json");

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

if (!fs.existsSync(metadataFile)) {
  fs.writeFileSync(metadataFile, JSON.stringify([], null, 2));
}

function readMetadata() {
  try {
    const raw = fs.readFileSync(metadataFile, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
}

function writeMetadata(data) {
  fs.writeFileSync(metadataFile, JSON.stringify(data, null, 2));
}

function formatBytes(bytes) {
  if (!bytes) return "0 Bytes";
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(1)} ${sizes[index]}`;
}

function getBearerKey(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function requireDeveloper(req, res, next) {
  const incomingKey =
    req.headers["x-admin-key"] ||
    req.headers["x-developer-key"] ||
    getBearerKey(req) ||
    req.query.key;

  if (!incomingKey || incomingKey !== ADMIN_KEY) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Developer access required."
    });
  }

  next();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname
      .replace(/[^\w.-]/g, "_")
      .replace(/_+/g, "_");

    const ext = path.extname(safeName) || ".pdf";
    const baseName = path.basename(safeName, ext).slice(0, 80);
    const uniqueName = `${crypto.randomUUID()}-${baseName}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const mimeType = file.mimetype || "";
    if (mimeType === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
      return;
    }

    cb(new Error("Only PDF files are allowed."));
  }
});

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(rootDir));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    server: "ElectroDocs",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/files", (req, res) => {
  try {
    res.json(readMetadata());
  } catch (error) {
    console.error("GET /api/files error:", error);
    res.status(500).json({ success: false, message: "Unable to load files." });
  }
});

app.post("/api/upload", requireDeveloper, upload.single("pdf"), (req, res) => {
  console.log("Upload request received");
  console.log("Headers:", {
    adminKeyPresent: !!(req.headers["x-admin-key"] || req.headers["x-developer-key"]),
    authHeaderPresent: !!req.headers.authorization
  });

  if (!req.file) {
    console.log("Upload failed: No PDF file received");
    return res.status(400).json({
      success: false,
      message: "No PDF uploaded."
    });
  }

  const title = (req.body.title || path.parse(req.file.originalname).name || "Untitled PDF").trim();
  const category = req.body.category || "Datasheet";
  const description = req.body.description || "No description added.";

  const doc = {
    id: crypto.randomUUID(),
    title,
    category,
    description,
    fileName: req.file.originalname,
    storedName: req.file.filename,
    fileSize: formatBytes(req.file.size),
    uploadedAt: new Date().toISOString(),
    url: `/uploads/${req.file.filename}`
  };

  const docs = readMetadata();
  docs.unshift(doc);
  writeMetadata(docs);

  console.log("Upload complete:", doc.title);

  return res.status(201).json({
    success: true,
    message: "PDF uploaded successfully.",
    file: doc
  });
});

app.delete("/api/files/:id", requireDeveloper, (req, res) => {
  const docs = readMetadata();
  const targetId = req.params.id;
  const index = docs.findIndex((doc) => doc.id === targetId);

  if (index === -1) {
    return res.status(404).json({
      success: false,
      message: "File not found."
    });
  }

  const removed = docs.splice(index, 1)[0];
  const filePath = path.join(uploadsDir, removed.storedName || "");

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  writeMetadata(docs);

  return res.json({
    success: true,
    message: "File deleted successfully."
  });
});

app.delete("/api/files", requireDeveloper, (req, res) => {
  const docs = readMetadata();

  docs.forEach((doc) => {
    const filePath = path.join(uploadsDir, doc.storedName || "");
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  writeMetadata([]);

  return res.json({
    success: true,
    message: "All files deleted successfully."
  });
});

app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: `Upload error: ${error.message}`
    });
  }

  if (error.message === "Only PDF files are allowed.") {
    return res.status(400).json({
      success: false,
      message: "Only PDF files are allowed."
    });
  }

  return res.status(500).json({
    success: false,
    message: "Server error. Please try again later."
  });
});

app.listen(PORT, () => {
  console.log(`ElectroDocs server running on http://localhost:${PORT}`);
  console.log(`Developer key required for upload routes: ${ADMIN_KEY}`);
});
