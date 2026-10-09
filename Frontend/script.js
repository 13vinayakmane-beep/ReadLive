
 // ========================================
 // READLIVE - COMMON SCRIPT
 // ========================================

// API address
const API_BASE = "http://https://readlive-backend.onrender.com";

// ========================================
// USER / ADMIN LOGIN
// ========================================

let loginType = "user";

function selectLoginType(type) {
    loginType = type;

    const userButton = document.getElementById("userLoginBtn");
    const adminButton = document.getElementById("adminLoginBtn");
    const roleText = document.getElementById("loginRoleText");
    const loginButton = document.getElementById("loginButton");

    if (userButton) userButton.classList.toggle("active", type === "user");
    if (adminButton) adminButton.classList.toggle("active", type === "admin");

    if (roleText) {
        roleText.innerText = type === "admin"
            ? "Login as an Administrator"
            : "Login as a User";
    }

    if (loginButton) {
        loginButton.innerText = type === "admin" ? "Admin Login" : "Login";
    }
}

// Make the logged-in user available to every page
function getReadLiveUser() {
    try {
        return JSON.parse(
            localStorage.getItem("readliveCurrentUser") ||
            localStorage.getItem("user") ||
            "null"
        );
    } catch {
        return null;
    }
}

// Keep both old and new storage names synchronized
function saveReadLiveUser(user, token) {
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("readliveCurrentUser", JSON.stringify(user));

    if (token) {
        localStorage.setItem("token", token);
        localStorage.setItem("readliveToken", token);
    }
}

// Login form
const loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", async function(event) {
        event.preventDefault();

        const loginUser = document.getElementById("loginUser").value.trim();
        const loginPassword = document.getElementById("loginPassword").value;
        const loginButton = document.getElementById("loginButton");

        if (loginButton) {
            loginButton.disabled = true;
            loginButton.innerText = "Logging in...";
        }

        try {
            const response = await fetch(`${API_BASE}/api/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email: loginUser,
                    password: loginPassword
                })
            });

            const data = await response.json();

            if (!response.ok) {
                alert(data.message || "Login failed.");
                return;
            }

            if (!data.user || !data.token) {
                alert("The server did not return the required login information.");
                return;
            }

            if (loginType === "admin" && data.user.role !== "admin") {
                alert("Access denied. This account is not an administrator.");
                return;
            }

            if (loginType === "user" && data.user.role === "admin") {
                alert("Please select Admin Login for your administrator account.");
                return;
            }

            saveReadLiveUser(data.user, data.token);

            alert("Login successful!");

            window.location.href = data.user.role === "admin"
                ? "admin-dashboard.html"
                : "home.html";

        } catch (error) {
            console.error("Login error:", error);
            alert("Cannot connect to the backend. Make sure the server is running on port 5000.");
        } finally {
            if (loginButton) {
                loginButton.disabled = false;
                loginButton.innerText = loginType === "admin"
                    ? "Admin Login"
                    : "Login";
            }
        }
    });
}

// ========================================
// REGISTRATION
// ========================================

// Registration must use the backend, not just show a success alert.
const registerForm = document.getElementById("registerForm");

if (registerForm) {
    registerForm.addEventListener("submit", async function(event) {
        event.preventDefault();

        const username = document.getElementById("username")?.value.trim();
        const email = document.getElementById("email")?.value.trim();
        const password = document.getElementById("password")?.value;
        const confirmPassword = document.getElementById("confirmPassword")?.value;

        if (!username || !email || !password || !confirmPassword) {
            alert("Please fill in all registration fields.");
            return;
        }

        if (password !== confirmPassword) {
            alert("Passwords do not match!");
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/api/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                alert(data.message || "Registration failed.");
                return;
            }

            alert("Registration successful! Please log in.");
            window.location.href = "login.html";

        } catch (error) {
            console.error("Registration error:", error);
            alert("Cannot connect to the backend server.");
        }
    });
}

// ========================================
// PROFILE ICON - ALL PAGES
// ========================================

document.addEventListener("DOMContentLoaded", function() {
    const profileButtons = document.querySelectorAll(
        "#topProfile, #profileButton, .profile-icon, [data-action='profile']"
    );

    profileButtons.forEach(function(button) {
        button.addEventListener("click", function(event) {
            // Let normal links work if they already point to profile.html.
            if (button.tagName === "A" &&
                button.getAttribute("href") === "profile.html") {
                return;
            }

            event.preventDefault();
            window.location.href = "profile.html";
        });
    });

    // Show the user's name wherever these common elements exist.
    const user = getReadLiveUser();

    if (user) {
        const username = user.username || user.name || user.email || "Reader";

        document.querySelectorAll(
            "#currentUsername, #topUsername, .current-username"
        ).forEach(function(element) {
            element.textContent = username;
        });

        document.querySelectorAll(
            "#topProfile, #profileButton, .profile-icon"
        ).forEach(function(element) {
            element.title = `Open ${username}'s profile`;
            element.setAttribute("aria-label", `Open ${username}'s profile`);
        });
    }
});

// Functions for pages that use inline onclick handlers
function openProfile() {
    window.location.href = "profile.html";
}

function openNotifications() {
    window.location.href = "notifications.html";
}

// ========================================
// HOME PAGE FUNCTIONS
// ========================================

function toggleFollow(button) {
    if (!button) return;

    const isFollowing =
        button.classList.contains("following") ||
        button.classList.contains("following-button");

    button.classList.toggle("following", !isFollowing);
    button.classList.toggle("following-button", !isFollowing);
    button.classList.toggle("follow-button", isFollowing);

    button.innerText = isFollowing ? "Follow" : "Following";
}

function likePost(button) {
    if (!button) return;

    const count = button.querySelector("span");
    if (!count) return;

    let likes = parseInt(count.innerText, 10) || 0;
    const liked = button.classList.toggle("liked");

    count.innerText = liked ? likes + 1 : Math.max(0, likes - 1);
}

function commentPost() {
    alert("Comment feature will be connected in a later update.");
}

function sharePost() {
    alert("Share feature will be connected in a later update.");
}

function createStory() {
    window.location.href = "add-story.html";
}

function openStory(username) {
    alert("Opening " + username + "'s story.");
}

function openStories() {
    window.location.href = "add-story.html";
}

function joinLive() {
    window.location.href = "live-sessions.html";
}

function startReading() {
    window.location.href = "reader.html";
}

function bookmarkBook(button) {
    if (!button) return;

    button.innerText = "♥ Bookmarked";
    button.style.background = "#6c4cff";
    button.style.color = "white";
}

// ========================================
// LIVE ROOM HELPERS
// ========================================

function sendMessage() {
    const input = document.getElementById("chatInput");
    const chat = document.getElementById("chatMessages");

    if (!input || !chat) return;

    const message = input.value.trim();
    if (!message) return;

    const wrapper = document.createElement("div");
    wrapper.className = "chat-message";

    const username = getReadLiveUser()?.username || "Reader";

    const nameElement = document.createElement("strong");
    nameElement.textContent = username;

    const messageElement = document.createElement("p");
    messageElement.textContent = message;

    wrapper.append(nameElement, messageElement);
    chat.appendChild(wrapper);

    input.value = "";
    chat.scrollTop = chat.scrollHeight;
}

function toggleMic(button) {
    if (!button) return;
    button.innerText = button.innerText.trim() === "🎤" ? "🔇" : "🎤";
}

function toggleCamera(button) {
    if (!button) return;
    button.innerText = button.innerText.trim() === "📹" ? "🚫" : "📹";
}

function leaveRoom() {
    window.location.href = "live-sessions.html";
}

function setReminder(button) {
    if (!button) return;
    button.innerText = "✓ Reminder Set";
    button.classList.add("reminded");
}

// ========================================
// SEARCH
// ========================================

function performSearch() {
    const input = document.getElementById("searchInput");
    if (!input) return;

    const value = input.value.toLowerCase();

    document.querySelectorAll(".search-result").forEach(function(result) {
        result.style.display =
            result.innerText.toLowerCase().includes(value) ? "flex" : "none";
    });
}

// ========================================
// NOTIFICATIONS
// ========================================

function markNotificationsRead() {
    document.querySelectorAll(".notification-item").forEach(function(item) {
        item.classList.remove("unread");
    });
}

// ========================================
// PROFILE EDIT BUTTON HELPER
// ========================================

function editProfile(button) {
    if (!button) return;

    if (button.innerText.trim() === "Edit Profile") {
        button.innerText = "Profile Saved";
    } else {
        button.innerText = "Edit Profile";
    }
}

// ========================================
// ADMIN DASHBOARD COUNTS
// ========================================

function updateAdminDashboard() {
    const counts = [
        ["totalUsers", "readliveUsers"],
        ["totalBooks", "readliveBooks"],
        ["totalLiveSessions", "readliveLiveSessions"],
        ["totalStories", "readliveStories"]
    ];

    counts.forEach(function([elementId, storageKey]) {
        const element = document.getElementById(elementId);
        if (!element) return;

        let values = [];

        try {
            values = JSON.parse(localStorage.getItem(storageKey)) || [];
        } catch {
            values = [];
        }

        element.innerText = values.length;
    });
}

// ========================================
// BOOKS FROM BACKEND
// ========================================

async function loadHomePageBooks() {
    const bookContainer =
        document.getElementById("bookList") ||
        document.getElementById("booksContainer");

    if (!bookContainer) return;

    try {
        const response = await fetch(`${API_BASE}/api/books`);
        const books = await response.json();

        if (!response.ok) {
            throw new Error(books.message || "Could not load books.");
        }

        bookContainer.innerHTML = "";

        if (!Array.isArray(books) || books.length === 0) {
            bookContainer.textContent = "No books available right now.";
            return;
        }

        books.forEach(function(book) {
            const card = document.createElement("div");
            card.className = "book-card";

            const cover = document.createElement("img");
            cover.src = book.coverImage || "https://via.placeholder.com/150";
            cover.alt = book.title || "Book cover";
            cover.style.cssText = "max-width:100%;height:200px;object-fit:cover;";

            const title = document.createElement("h3");
            title.textContent = book.title || "Untitled";

            const author = document.createElement("p");
            author.textContent = "Author: " + (book.author || "Unknown");

            const description = document.createElement("p");
            description.textContent = book.description || "";

            const saveButton = document.createElement("button");
            saveButton.className = "main-btn";
            saveButton.textContent = "Want to Read";
            saveButton.addEventListener("click", function() {
                saveBookToReadingList(book._id);
            });

            card.append(cover, title, author, description, saveButton);
            bookContainer.appendChild(card);
        });

    } catch (error) {
        console.error("Error loading books:", error);
    }
}

async function saveBookToReadingList(bookId) {
    const token =
        localStorage.getItem("readliveToken") ||
        localStorage.getItem("token");

    if (!token) {
        alert("Please log in first to save books.");
        window.location.href = "login.html";
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/saved-books`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                bookId,
                status: "Want to Read"
            })
        });

        const data = await response.json();

        if (response.ok) {
            alert("Book added to your Reading List!");
        } else {
            alert(data.message || "Failed to save book.");
        }

    } catch (error) {
        console.error("Error saving book:", error);
        alert("Could not connect to the backend.");
    }
}

// ========================================
// INITIALIZE
// ========================================

document.addEventListener("DOMContentLoaded", function() {
    updateAdminDashboard();
    loadHomePageBooks();
});