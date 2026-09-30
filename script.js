document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (token) {
    showNotesApp();
  } else {
    showAuth();
  }
});

// Navigation Views
function showAuth() {
  document.getElementById('auth-container').classList.remove('hidden');
  document.getElementById('notes-container').style.display = 'none';
  document.getElementById('logout-btn').style.display = 'none';
}

function showNotesApp() {
  document.getElementById('auth-container').classList.add('hidden');
  document.getElementById('notes-container').style.display = 'block';
  document.getElementById('logout-btn').style.display = 'inline-block';
  loadNotes();
}

// User Sign Up
document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const dob = document.getElementById('signup-dob').value;
  const password = document.getElementById('signup-password').value;

  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, dob, password })
    });

    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('token', data.token);
      showNotesApp();
    } else {
      alert(data.error);
    }
  } catch (err) {
    alert('Signup error: ' + err.message);
  }
});

// User Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('token', data.token);
      showNotesApp();
    } else {
      alert(data.error);
    }
  } catch (err) {
    alert('Login error: ' + err.message);
  }
});

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('token');
  showAuth();
});

// Load Notes from API
async function loadNotes() {
  const token = localStorage.getItem('token');
  try {
    const res = await fetch('/api/notes', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const notes = await res.json();

    if (res.ok) {
      renderNotes(notes);
    } else if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('token');
      showAuth();
    }
  } catch (err) {
    console.error("Error loading notes:", err);
  }
}

// Render Note Cards in UI
function renderNotes(notes) {
  const grid = document.getElementById('notes-grid');
  grid.innerHTML = '';

  if (!notes || notes.length === 0) {
    grid.innerHTML = '<p style="color: #94a3b8; grid-column: 1/-1;">No notes yet. Create your first note above!</p>';
    return;
  }

  notes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.style.backgroundColor = note.color || '#1e293b';

    // File / Image Attachment Preview
    let attachmentHtml = '';
    if (note.file_url) {
      const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(note.file_url);
      if (isImage) {
        attachmentHtml = `<div class="note-attachment"><img src="${note.file_url}" alt="Attachment" /></div>`;
      } else {
        attachmentHtml = `<div class="note-attachment"><a href="${note.file_url}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-paperclip"></i> View Attachment</a></div>`;
      }
    }

    // Date formatting
    const formattedDate = note.created_at 
      ? new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';

    card.innerHTML = `
      <div>
        <div class="note-card-header">
          <h4>${note.title}</h4>
          <button class="pin-btn ${note.is_pinned ? 'pinned' : ''}" onclick="togglePin(${note.id}, ${!note.is_pinned})">
            <i class="fa-solid fa-thumbtack"></i>
          </button>
        </div>
        <p>${note.content || ''}</p>
        ${attachmentHtml}
      </div>
      <div class="note-card-footer">
        <span class="note-date">${formattedDate}</span>
        <div class="note-actions">
          <button class="icon-btn danger" onclick="deleteNote(${note.id})">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

// Save Note with File Attachment
document.getElementById('note-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData();
  formData.append('title', document.getElementById('note-title').value);
  formData.append('content', document.getElementById('note-content').value);
  formData.append('color', document.getElementById('note-color').value);

  const fileInput = document.getElementById('note-file');
  if (fileInput && fileInput.files[0]) {
    formData.append('attachment', fileInput.files[0]);
  }

  const token = localStorage.getItem('token');

  try {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (res.ok) {
      document.getElementById('note-form').reset();
      document.getElementById('note-color').value = '#1e293b';
      loadNotes();
    } else {
      const err = await res.json();
      alert('Failed to save note: ' + err.error);
    }
  } catch (err) {
    alert('Error saving note: ' + err.message);
  }
});

// Toggle Pin Status
async function togglePin(id, is_pinned) {
  const token = localStorage.getItem('token');
  await fetch(`/api/notes/${id}/pin`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ is_pinned })
  });
  loadNotes();
}

// Delete Note
async function deleteNote(id) {
  if (!confirm('Are you sure you want to delete this note?')) return;
  const token = localStorage.getItem('token');
  await fetch(`/api/notes/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  loadNotes();
}
