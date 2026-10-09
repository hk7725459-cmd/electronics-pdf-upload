const pdfForm = document.getElementById("pdf-form");
const pdfInput = document.getElementById("pdf-input");
const documentTitle = document.getElementById("document-title");
const documentCategory = document.getElementById("document-category");
const documentDescription = document.getElementById("document-description");
const selectedFileName = document.getElementById("selected-file-name");
const uploadStatus = document.getElementById("upload-status");
const pdfGrid = document.getElementById("pdf-grid");
const emptyState = document.getElementById("empty-state");
const uploadedCount = document.getElementById("uploaded-count");
const clearAllBtn = document.getElementById("clear-all");
const pdfCardTemplate = document.getElementById("pdf-card-template");
const dropzone = document.querySelector(".dropzone");

let uploadedDocs = [];

function setStatus(message, tone = "info") {
  uploadStatus.textContent = message;

  const tones = {
    info: {
      color: "#67e8f9",
      background: "rgba(103, 232, 249, 0.08)",
      borderColor: "rgba(103, 232, 249, 0.3)"
    },
    success: {
      color: "#34d399",
      background: "rgba(52, 211, 153, 0.12)",
      borderColor: "rgba(52, 211, 153, 0.25)"
    },
    warning: {
      color: "#fbbf24",
      background: "rgba(251, 191, 36, 0.1)",
      borderColor: "rgba(251, 191, 36, 0.25)"
    },
    error: {
      color: "#fda4af",
      background: "rgba(251, 113, 133, 0.08)",
      borderColor: "rgba(251, 113, 133, 0.2)"
    }
  };

  const style = tones[tone] || tones.info;
  uploadStatus.style.color = style.color;
  uploadStatus.style.background = style.background;
  uploadStatus.style.borderColor = style.borderColor;
}

async function fetchFiles() {
  try {
    const response = await fetch("/api/files");
    const data = await response.json();

    uploadedDocs = Array.isArray(data) ? data : [];
    renderDocuments();
  } catch (error) {
    console.error("Failed to load files:", error);
    setStatus("Could not load files", "error");
  }
}

pdfInput.addEventListener("change", () => {
  const file = pdfInput.files && pdfInput.files[0];

  if (!file) {
    selectedFileName.textContent = "No file selected";
    setStatus("Ready", "info");
    return;
  }

  selectedFileName.textContent = file.name;
  setStatus("File selected", "warning");
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("drag-over");
  });
});

dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files && event.dataTransfer.files[0];
  if (!file) return;

  pdfInput.files = event.dataTransfer.files;
  selectedFileName.textContent = file.name;
  setStatus("File selected", "warning");
});

pdfForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = pdfInput.files && pdfInput.files[0];
  if (!file) {
    setStatus("Please select a PDF", "error");
    return;
  }

  if (file.type !== "application/pdf") {
    setStatus("Only PDF files are allowed", "error");
    return;
  }

  const formData = new FormData();
  formData.append("pdf", file);
  formData.append("title", documentTitle.value.trim() || file.name.replace(/\.pdf$/i, ""));
  formData.append("category", documentCategory.value);
  formData.append("description", documentDescription.value.trim() || "No description added.");

  try {
    setStatus("Uploading...", "warning");

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Upload failed");
    }

    pdfForm.reset();
    selectedFileName.textContent = "No file selected";
    setStatus("Uploaded", "success");

    await fetchFiles();
  } catch (error) {
    console.error("Upload failed:", error);
    setStatus(error.message || "Upload failed", "error");
  }
});

clearAllBtn.addEventListener("click", async () => {
  if (!uploadedDocs.length) return;

  try {
    const response = await fetch("/api/files", { method: "DELETE" });
    if (!response.ok) throw new Error("Could not clear files");

    await fetchFiles();
    setStatus("Cleared", "info");
  } catch (error) {
    console.error("Clear failed:", error);
    setStatus("Clear failed", "error");
  }
});

function renderDocuments() {
  pdfGrid.innerHTML = "";

  if (uploadedDocs.length === 0) {
    emptyState.classList.add("visible");
  } else {
    emptyState.classList.remove("visible");
  }

  uploadedDocs.forEach((doc) => {
    const fragment = pdfCardTemplate.content.cloneNode(true);

    const title = fragment.querySelector(".pdf-title");
    const category = fragment.querySelector(".pdf-category");
    const description = fragment.querySelector(".pdf-description");
    const date = fragment.querySelector(".pdf-date");
    const size = fragment.querySelector(".pdf-size");
    const viewLink = fragment.querySelector(".view-btn");
    const removeBtn = fragment.querySelector(".remove-btn");

    title.textContent = doc.title;
    category.textContent = doc.category;
    description.textContent = doc.description;
    date.textContent = new Date(doc.uploadedAt).toLocaleDateString();
    size.textContent = doc.fileSize;

    viewLink.href = doc.url;
    viewLink.setAttribute("download", doc.fileName);

    removeBtn.addEventListener("click", async () => {
      try {
        const response = await fetch(`/api/files/${doc.id}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Delete failed");

        await fetchFiles();
      } catch (error) {
        console.error("Delete failed:", error);
        setStatus("Delete failed", "error");
      }
    });

    pdfGrid.appendChild(fragment);
  });

  uploadedCount.textContent = uploadedDocs.length;
}

fetchFiles();
