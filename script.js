// =========================================================================
// 1. BACKEND API CONFIGURATION
// =========================================================================

const API_BASE_URL = "/api";
// DOM Elements
const authScreen = document.getElementById("auth-screen");
const appDashboard = document.getElementById("app-dashboard");

const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const logoutBtn = document.getElementById("logout-btn");
const userDisplayName = document.getElementById("user-display-name");

const noteTitleInput = document.getElementById("note-title");
const noteContentInput = document.getElementById("note-content");
const addNoteBtn = document.getElementById("add-note-btn");
const searchInput = document.getElementById("search-input");
const notesGrid = document.getElementById("notes-grid");

let allNotes = [];
let selectedNoteColor = "#1e293b";

// =========================================================================
// 2. APP INITIALIZATION & AUTH CHECK
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
  checkAuthSession();
});

function checkAuthSession() {
  const token = localStorage.getItem("token");
  const userName = localStorage.getItem("userName");

  if (token && userName) {
    userDisplayName.textContent = `Welcome, ${userName}`;
    authScreen.classList.add("hidden");
    appDashboard.classList.remove("hidden");
    fetchNotes();
  } else {
    appDashboard.classList.add("hidden");
    authScreen.classList.remove("hidden");
  }
}

// =========================================================================
// 3. AUTHENTICATION (SIGN UP, LOGIN, LOGOUT)
// =========================================================================

// Sign Up
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const dob = document.getElementById("signup-dob").value;
  const password = document.getElementById("signup-password").value;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, dob, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Sign up failed.");

    localStorage.setItem("token", data.token);
    localStorage.setItem("userName", data.user.full_name);

    signupForm.reset();
    checkAuthSession();
  } catch (err) {
    alert(`Registration Error: ${err.message}`);
  }
});

// Log In
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed.");

    localStorage.setItem("token", data.token);
    localStorage.setItem("userName", data.user.full_name);

    loginForm.reset();
    checkAuthSession();
  } catch (err) {
    alert(`Login Error: ${err.message}`);
  }
});

// Log Out
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("userName");
  allNotes = [];
  checkAuthSession();
});

// Tab Switcher
window.switchTab = function(tab) {
  const loginF = document.getElementById("login-form");
  const signupF = document.getElementById("signup-form");
  const tabLogin = document.getElementById("tab-login");
  const tabSignup = document.getElementById("tab-signup");

  if (tab === "login") {
    loginF.classList.remove("hidden");
    signupF.classList.add("hidden");
    tabLogin.classList.add("active");
    tabSignup.classList.remove("active");
  } else {
    signupF.classList.remove("hidden");
    loginF.classList.add("hidden");
    tabSignup.classList.add("active");
    tabLogin.classList.remove("active");
  }
};

// =========================================================================
// 4. NOTES MANAGEMENT (FETCH, ADD, PIN, DELETE)
// =========================================================================

function getAuthHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${localStorage.getItem("token")}`
  };
}

async function fetchNotes() {
  try {
    const res = await fetch(`${API_BASE_URL}/notes`, {
      headers: getAuthHeaders()
    });

    if (res.status === 401 || res.status === 403) {
      logoutBtn.click();
      return;
    }

    allNotes = await res.json();
    renderNotes(allNotes);
  } catch (err) {
    console.error("Failed to load notes:", err);
  }
}

addNoteBtn.addEventListener("click", async () => {
  const title = noteTitleInput.value.trim();
  const content = noteContentInput.value.trim();

  if (!title && !content) {
    alert("Please enter a title or note content!");
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/notes`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        title: title || "Untitled Note",
        content: content,
        color: selectedNoteColor
      })
    });

    if (!res.ok) throw new Error("Failed to save note.");

    noteTitleInput.value = "";
    noteContentInput.value = "";
    resetColorSelection();
    fetchNotes();
  } catch (err) {
    alert(err.message);
  }
});

window.togglePinNote = async (noteId, currentStatus) => {
  try {
    await fetch(`${API_BASE_URL}/notes/${noteId}/pin`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({ is_pinned: !currentStatus })
    });
    fetchNotes();
  } catch (err) {
    console.error("Pin error:", err);
  }
};

window.deleteNote = async (noteId) => {
  if (confirm("Are you sure you want to delete this note?")) {
    try {
      await fetch(`${API_BASE_URL}/notes/${noteId}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      fetchNotes();
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  }
};

// =========================================================================
// 5. UI HELPERS & SEARCH
// =========================================================================

function renderNotes(notesToDisplay) {
  notesGrid.innerHTML = "";

  if (notesToDisplay.length === 0) {
    notesGrid.innerHTML = `<p style="color: var(--text-muted); grid-column: 1/-1;">No notes saved yet.</p>`;
    return;
  }

  notesToDisplay.forEach(note => {
    const noteCard = document.createElement("div");
    noteCard.className = "note-card";
    noteCard.style.backgroundColor = note.color || "#1e293b";

    const dateStr = note.created_at
      ? new Date(note.created_at).toLocaleDateString()
      : "Just now";

    noteCard.innerHTML = `
      <div>
        <div class="note-card-header">
          <h4>${escapeHTML(note.title)}</h4>
          <button class="pin-btn ${note.is_pinned ? 'active' : ''}" onclick="togglePinNote(${note.id}, ${note.is_pinned})">
            <i class="fa-solid fa-thumbtack"></i>
          </button>
        </div>
        <p>${escapeHTML(note.content)}</p>
      </div>
      <div class="note-card-footer">
        <span class="note-date">${dateStr}</span>
        <div class="note-actions">
          <button class="icon-btn danger" onclick="deleteNote(${note.id})">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;

    notesGrid.appendChild(noteCard);
  });
}

searchInput.addEventListener("input", (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const filtered = allNotes.filter(n =>
    n.title.toLowerCase().includes(searchTerm) ||
    (n.content && n.content.toLowerCase().includes(searchTerm))
  );
  renderNotes(filtered);
});

document.querySelectorAll(".color-dot").forEach(dot => {
  dot.addEventListener("click", (e) => {
    document.querySelectorAll(".color-dot").forEach(d => d.classList.remove("active"));
    e.target.classList.add("active");
    selectedNoteColor = e.target.dataset.color;
  });
});

function resetColorSelection() {
  document.querySelectorAll(".color-dot").forEach(d => d.classList.remove("active"));
  const defaultDot = document.querySelector(".color-dot.default");
  if (defaultDot) {
    defaultDot.classList.add("active");
    selectedNoteColor = defaultDot.dataset.color;
  }
}

function escapeHTML(str) {
  return (str || "").replace(/[&<>'"]/g,
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
