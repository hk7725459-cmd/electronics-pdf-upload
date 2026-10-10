const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const rootDir = __dirname;
const uploadsDir = path.join(rootDir, "uploads");
const dataDir = path.join(rootDir, "data");
const metadataFile = path.join(dataDir, "files.json");

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

if (!fs.existsSync(metadataFile)) {
  fs.writeFileSync(metadataFile, JSON.stringify([], null, 2));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || ".pdf");
    const uniqueName = `${crypto.randomUUID()}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  }
});

function readMetadata() {
  try {
    return JSON.parse(fs.readFileSync(metadataFile, "utf8"));
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

app.use(express.json());
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(rootDir));

app.get("/api/files", (req, res) => {
  try {
    res.json(readMetadata());
  } catch (error) {
    res.status(500).json({ message: "Unable to load files" });
  }
});

app.post("/api/upload", upload.single("pdf"), (req, res) => {
  console.log("Upload endpoint hit");
  console.log("File:", req.file);
  console.log("Body:", req.body);

  if (!req.file) {
    console.log("No file uploaded");
    return res.status(400).json({ message: "No PDF uploaded" });
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

  console.log("File uploaded successfully:", doc);
  res.status(201).json(doc);
});

app.delete("/api/files/:id", (req, res) => {
  const docs = readMetadata();
  const index = docs.findIndex((doc) => doc.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ message: "File not found" });
  }

  const [fileToDelete] = docs.splice(index, 1);
  const filePath = path.join(uploadsDir, fileToDelete.storedName || "");

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  writeMetadata(docs);
  res.json({ message: "Deleted successfully" });
});

app.delete("/api/files", (req, res) => {
  const docs = readMetadata();

  docs.forEach((doc) => {
    const filePath = path.join(uploadsDir, doc.storedName || "");
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  writeMetadata([]);
  res.json({ message: "All files deleted" });
});

app.use((error, req, res, next) => {
  console.error("Error:", error);
  if (error instanceof multer.MulterError || error.message === "Only PDF files are allowed") {
    return res.status(400).json({ message: error.message || "Upload failed" });
  }
  next(error);
});

app.listen(PORT, () => {
  console.log(`ElectroDocs server running on http://localhost:${PORT}`);
});
