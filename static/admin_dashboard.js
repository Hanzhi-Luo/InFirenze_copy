const tabsContainer = document.getElementById("admin-tabs");
const searchInput = document.getElementById("admin-search");
const areaFilter = document.getElementById("admin-area-filter");
const categoryFilter = document.getElementById("admin-category-filter");
const cards = Array.from(document.querySelectorAll(".event-admin-card"));
const emptyState = document.getElementById("admin-empty-state");

const previewEmpty = document.getElementById("preview-empty");
const previewContent = document.getElementById("preview-content");
const previewImage = document.getElementById("preview-image");
const previewTitle = document.getElementById("preview-title");
const previewStatus = document.getElementById("preview-status");
const previewDatetime = document.getElementById("preview-datetime");
const previewMeta = document.getElementById("preview-meta");
const previewDescription = document.getElementById("preview-description");
const previewCoordinates = document.getElementById("preview-coordinates");
const previewCreator = document.getElementById("preview-creator");
const previewEdit = document.getElementById("preview-edit");
const previewApprove = document.getElementById("preview-approve");
const previewReject = document.getElementById("preview-reject");
const previewDetail = document.getElementById("preview-detail");

let activeStatus = "pending";
let selectedEventId = null;

function visibleCards() {
  return cards.filter((card) => card.style.display !== "none");
}

function setActiveCard(cardToSelect) {
  cards.forEach((card) => {
    card.classList.toggle("is-selected", card === cardToSelect);
  });

  if (!cardToSelect) {
    selectedEventId = null;
    if (previewContent) previewContent.hidden = true;
    if (previewEmpty) previewEmpty.hidden = false;
    return;
  }

  selectedEventId = cardToSelect.dataset.eventId || null;
  if (previewContent) previewContent.hidden = false;
  if (previewEmpty) previewEmpty.hidden = true;

  const status = cardToSelect.dataset.status || "pending";
  const title = cardToSelect.dataset.titleDisplay || "";
  const dateValue = cardToSelect.dataset.date || "";
  const timeValue = cardToSelect.dataset.time || "";
  const area = cardToSelect.dataset.area || "";
  const category = cardToSelect.dataset.category || "";
  const description = cardToSelect.dataset.description || "No description provided.";
  const imageUrl = cardToSelect.dataset.imageUrl || "";
  const lat = cardToSelect.dataset.lat || "";
  const lng = cardToSelect.dataset.lng || "";
  const creator = cardToSelect.dataset.creator || "Unknown";

  if (previewImage) {
    previewImage.src = imageUrl;
    previewImage.alt = title || "Event preview image";
  }
  if (previewTitle) previewTitle.textContent = title;
  if (previewStatus) {
    previewStatus.textContent = status;
    previewStatus.className = `status-badge status-${status}`;
  }
  if (previewDatetime) previewDatetime.textContent = `${dateValue} · ${timeValue}`;
  if (previewMeta) previewMeta.textContent = `${area} · ${category}`;
  if (previewDescription) previewDescription.textContent = description;
  if (previewCoordinates) previewCoordinates.textContent = `${lat}, ${lng}`;
  if (previewCreator) previewCreator.textContent = creator;

  if (previewEdit) previewEdit.href = cardToSelect.dataset.editUrl || "#";
  if (previewApprove) {
    previewApprove.href = cardToSelect.dataset.approveUrl || "#";
    previewApprove.style.display = status === "approved" ? "none" : "";
  }
  if (previewReject) {
    previewReject.href = cardToSelect.dataset.rejectUrl || "#";
    previewReject.style.display = status === "rejected" ? "none" : "";
  }
  if (previewDetail) previewDetail.href = cardToSelect.dataset.detailUrl || "#";
}

function ensureSelectedVisible() {
  const visible = visibleCards();
  const selectedVisible = visible.find((card) => card.dataset.eventId === selectedEventId);

  if (selectedVisible) {
    setActiveCard(selectedVisible);
    return;
  }

  if (visible.length > 0) {
    setActiveCard(visible[0]);
    return;
  }

  setActiveCard(null);
}

function applyAdminFilters() {
  const searchText = (searchInput?.value || "").trim().toLowerCase();
  const areaValue = areaFilter?.value || "";
  const categoryValue = categoryFilter?.value || "";

  let visibleCount = 0;

  cards.forEach((card) => {
    const status = card.dataset.status || "";
    const title = card.dataset.title || "";
    const area = card.dataset.area || "";
    const category = card.dataset.category || "";

    const matchStatus = status === activeStatus;
    const matchSearch = !searchText || title.includes(searchText);
    const matchArea = !areaValue || area === areaValue;
    const matchCategory = !categoryValue || category === categoryValue;

    const visible = matchStatus && matchSearch && matchArea && matchCategory;
    card.style.display = visible ? "" : "none";
    if (visible) visibleCount += 1;
  });

  if (emptyState) {
    emptyState.style.display = visibleCount === 0 ? "block" : "none";
  }

  ensureSelectedVisible();
}

if (tabsContainer) {
  tabsContainer.addEventListener("click", (event) => {
    const tab = event.target.closest(".admin-tab");
    if (!tab) return;

    activeStatus = tab.dataset.status || "pending";
    tabsContainer.querySelectorAll(".admin-tab").forEach((btn) => {
      btn.classList.toggle("is-active", btn === tab);
    });

    applyAdminFilters();
  });
}

cards.forEach((card) => {
  card.addEventListener("click", () => {
    setActiveCard(card);
  });
});

[searchInput, areaFilter, categoryFilter].forEach((control) => {
  if (!control) return;
  control.addEventListener("input", applyAdminFilters);
  control.addEventListener("change", applyAdminFilters);
});

applyAdminFilters();
