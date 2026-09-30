// =========================================================================
// 1. FIREBASE CONFIGURATION & INITIALIZATION
// =========================================================================
const API_BASE_URL = "https://store1cloude.onrender.com/api";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// REPLACE WITH YOUR FIREBASE PROJECT CONFIGURATION
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// =========================================================================
// 2. DOM ELEMENTS & APPLICATION STATE
// =========================================================================
const authScreen = document.getElementById("auth-screen");
const appDashboard = document.getElementById("app-dashboard");

const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const googleLoginBtn = document.getElementById("google-login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userDisplayName = document.getElementById("user-display-name");

const noteTitleInput = document.getElementById("note-title");
const noteContentInput = document.getElementById("note-content");
const addNoteBtn = document.getElementById("add-note-btn");
const searchInput = document.getElementById("search-input");
const notesGrid = document.getElementById("notes-grid");

let currentUser = null;
let notesUnsubscribe = null;
let allNotes = [];
let selectedNoteColor = "#1e293b";

// =========================================================================
// 3. AUTHENTICATION LOGIC
// =========================================================================

// Listen to auth state changes (Detect login/logout across sessions)
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    userDisplayName.textContent = `Welcome, ${user.displayName || "User"}`;
    
    // Switch Views
    authScreen.classList.add("hidden");
    appDashboard.classList.remove("hidden");

    // Start listening for notes in real time
    listenToNotes(user.uid);
  } else {
    currentUser = null;
    allNotes = [];
    
    // Unsubscribe from Firestore updates when logged out
    if (notesUnsubscribe) notesUnsubscribe();

    // Switch Views
    appDashboard.classList.add("hidden");
    authScreen.classList.remove("hidden");
  }
});

// Sign Up with Email, Password, Name, and DOB
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const dob = document.getElementById("signup-dob").value;
  const password = document.getElementById("signup-password").value;

  try {
    // 1. Create Auth Account
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. Update Auth Profile Display Name
    await updateProfile(user, { displayName: name });

    // 3. Save User Details (DOB, Name) to Firestore
    await setDoc(doc(db, "users", user.uid), {
      fullName: name,
      email: email,
      dateOfBirth: dob,
      createdAt: serverTimestamp()
    });

    signupForm.reset();
  } catch (error) {
    alert(`Registration Error: ${error.message}`);
  }
});

// Log In with Email & Password
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginForm.reset();
  } catch (error) {
    alert(`Login Failed: ${error.message}`);
  }
});

// Google Sign-In
googleLoginBtn.addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Create user doc if signing in with Google for the first time
    await setDoc(doc(db, "users", user.uid), {
      fullName: user.displayName,
      email: user.email,
      createdAt: serverTimestamp()
    }, { merge: true });

  } catch (error) {
    alert(`Google Sign-In Error: ${error.message}`);
  }
});

// Log Out
logoutBtn.addEventListener("click", () => {
  signOut(auth);
});

// =========================================================================
// 4. REAL-TIME FIRESTORE NOTE OPERATIONS
// =========================================================================

// Listen to Firestore changes in real-time
function listenToNotes(userId) {
  const q = query(
    collection(db, "notes"),
    where("userId", "==", userId)
  );

  notesUnsubscribe = onSnapshot(q, (snapshot) => {
    allNotes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Sort notes: Pinned notes first, then by date created
    allNotes.sort((a, b) => {
      if (b.isPinned !== a.isPinned) return b.isPinned - a.isPinned;
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });

    renderNotes(allNotes);
  }, (error) => {
    console.error("Error loading notes: ", error);
  });
}

// Add New Note
addNoteBtn.addEventListener("click", async () => {
  const title = noteTitleInput.value.trim();
  const content = noteContentInput.value.trim();

  if (!title && !content) {
    alert("Please enter a title or note content!");
    return;
  }

  try {
    await addDoc(collection(db, "notes"), {
      userId: currentUser.uid,
      title: title || "Untitled Note",
      content: content,
      color: selectedNoteColor,
      isPinned: false,
      createdAt: serverTimestamp()
    });

    // Reset input fields
    noteTitleInput.value = "";
    noteContentInput.value = "";
    resetColorSelection();
  } catch (error) {
    alert(`Failed to save note: ${error.message}`);
  }
});

// Toggle Pin Status
window.togglePinNote = async (noteId, currentStatus) => {
  try {
    const noteRef = doc(db, "notes", noteId);
    await updateDoc(noteRef, { isPinned: !currentStatus });
  } catch (error) {
    console.error("Pin update failed: ", error);
  }
};

// Delete Note
window.deleteNote = async (noteId) => {
  if (confirm("Are you sure you want to delete this note?")) {
    try {
      await deleteDoc(doc(db, "notes", noteId));
    } catch (error) {
      alert(`Delete error: ${error.message}`);
    }
  }
};

// =========================================================================
// 5. UI & SEARCH HELPERS
// =========================================================================

// Render notes to the grid
function renderNotes(notesToDisplay) {
  notesGrid.innerHTML = "";

  if (notesToDisplay.length === 0) {
    notesGrid.innerHTML = `<p style="color: var(--text-muted); grid-column: 1/-1;">No notes found. Take one above!</p>`;
    return;
  }

  notesToDisplay.forEach(note => {
    const noteCard = document.createElement("div");
    noteCard.className = "note-card";
    noteCard.style.backgroundColor = note.color || "#1e293b";

    const dateStr = note.createdAt?.seconds
      ? new Date(note.createdAt.seconds * 1000).toLocaleDateString()
      : "Just now";

    noteCard.innerHTML = `
      <div>
        <div class="note-card-header">
          <h4>${escapeHTML(note.title)}</h4>
          <button class="pin-btn ${note.isPinned ? 'active' : ''}" onclick="togglePinNote('${note.id}', ${note.isPinned})">
            <i class="fa-solid fa-thumbtack"></i>
          </button>
        </div>
        <p>${escapeHTML(note.content)}</p>
      </div>
      <div class="note-card-footer">
        <span class="note-date">${dateStr}</span>
        <div class="note-actions">
          <button class="icon-btn danger" onclick="deleteNote('${note.id}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;

    notesGrid.appendChild(noteCard);
  });
}

// Live Search Filter
searchInput.addEventListener("input", (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const filteredNotes = allNotes.filter(note => 
    note.title.toLowerCase().includes(searchTerm) || 
    note.content.toLowerCase().includes(searchTerm)
  );
  renderNotes(filteredNotes);
});

// Color Selection Logic
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

// Prevent XSS attacks in rendered HTML
function escapeHTML(str) {
  return (str || "").replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
