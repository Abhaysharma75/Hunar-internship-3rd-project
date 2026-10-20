
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const STORAGE_KEY = "taskflow_pro_tasks_v2";
const THEME_KEY = "taskflow_pro_theme";
const SESSION_KEY = "taskflow_pro_sessions";

let tasks = loadTasks();
let currentFilter = "all";
let currentCategory = "all";
let editingId = null;
let sessions = Number(localStorage.getItem(SESSION_KEY)) || 0;
let toastTimeout;
let timerInterval = null;
let selectedMinutes = 25;
let remainingSeconds = selectedMinutes * 60;
let timerRunning = false;

function loadTasks() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(saved) ? saved.filter(t =>
            t && typeof t.id === "string" && typeof t.title === "string"
        ).map(t => ({
            id: t.id,
            title: t.title,
            category: ["Study", "Work", "Personal"].includes(t.category) ? t.category : "Personal",
            priority: ["high", "medium", "low"].includes(t.priority) ? t.priority : "medium",
            deadline: typeof t.deadline === "string" ? t.deadline : "",
            status: ["todo", "progress", "completed"].includes(t.status)
                ? t.status
                : (t.completed ? "completed" : "todo"),
            createdAt: Number(t.createdAt) || Date.now()
        })) : [];
    } catch {
        return [];
    }
}

function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("show"), 2600);
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        '"': "&quot;", "'": "&#39;"
    })[char]);
}

function isOverdue(task) {
    if (!task.deadline || task.status === "completed") return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(`${task.deadline}T00:00:00`) < today;
}

function formatDeadline(date) {
    if (!date) return "No deadline";
    const value = new Date(`${date}T00:00:00`);
    return Number.isNaN(value.getTime())
        ? "No deadline"
        : value.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function renderTasks() {
    const search = $("#searchInput").value.trim().toLowerCase();
    const priority = $("#priorityFilter").value;

    const filtered = tasks.filter(task => {
        const matchesStatus = currentFilter === "all" ||
            (currentFilter === "pending" && task.status === "todo") ||
            task.status === currentFilter;
        const matchesCategory = currentCategory === "all" || task.category === currentCategory;
        const matchesSearch = task.title.toLowerCase().includes(search);
        const matchesPriority = priority === "all" || task.priority === priority;
        return matchesStatus && matchesCategory && matchesSearch && matchesPriority;
    }).sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        if (a.status === "completed" && b.status !== "completed") return 1;
        if (b.status === "completed" && a.status !== "completed") return -1;
        return order[a.priority] - order[b.priority] || b.createdAt - a.createdAt;
    });

    $("#visibleCount").textContent = `${filtered.length} task${filtered.length === 1 ? "" : "s"}`;
    $("#taskList").innerHTML = filtered.map(task => {
        const overdue = isOverdue(task);
        const statusLabel = {
            todo: "To-do",
            progress: "In progress",
            completed: "Completed"
        }[task.status];

        return `
      <article class="task-item ${task.status === "completed" ? "is-complete" : ""}">
        <div class="task-main">
          <input class="task-check" type="checkbox" aria-label="Complete ${escapeHTML(task.title)}"
            data-action="complete" data-id="${escapeHTML(task.id)}"
            ${task.status === "completed" ? "checked" : ""}>
          <div class="task-body">
            <div class="task-title">${escapeHTML(task.title)}</div>
            <div class="task-meta">
              <span class="pill">${escapeHTML(task.category)}</span>
              <span class="pill priority-${task.priority}">${task.priority[0].toUpperCase() + task.priority.slice(1)}</span>
              <span class="pill ${overdue ? "overdue" : ""}">${overdue ? "⚠ Overdue · " : "◷ "}${escapeHTML(formatDeadline(task.deadline))}</span>
              <span class="pill">${statusLabel}</span>
            </div>
          </div>
          <div class="task-actions">
            <button class="icon-btn" data-action="status" data-id="${escapeHTML(task.id)}"
              aria-label="Change status" title="Change status">${task.status === "todo" ? "▶" : task.status === "progress" ? "✓" : "↺"}</button>
            <button class="icon-btn" data-action="edit" data-id="${escapeHTML(task.id)}" aria-label="Edit task" title="Edit">✎</button>
            <button class="icon-btn" data-action="delete" data-id="${escapeHTML(task.id)}" aria-label="Delete task" title="Delete">✕</button>
          </div>
        </div>
      </article>`;
    }).join("");

    $("#emptyState").style.display = filtered.length ? "none" : "block";
    $("#taskList").style.display = filtered.length ? "grid" : "none";

    const all = tasks.length;
    const completed = tasks.filter(t => t.status === "completed").length;
    const inProgress = tasks.filter(t => t.status === "progress").length;
    const overdue = tasks.filter(isOverdue).length;
    const percent = all ? Math.round(completed / all * 100) : 0;

    $("#totalStat").textContent = all;
    $("#progressStat").textContent = inProgress;
    $("#completedStat").textContent = completed;
    $("#overdueStat").textContent = overdue;
    $("#allCount").textContent = all;
    $("#progressPercent").textContent = `${percent}%`;
    $("#progressFoot").textContent = `${percent}%`;
    $("#progressBar").style.width = `${percent}%`;
    $("#progressRing").style.background =
        `conic-gradient(var(--purple) ${percent}%, var(--panel2) ${percent}%)`;
    $("#progressMessage").textContent = all === 0
        ? "Your next win starts with one task."
        : percent === 100
            ? "Amazing! You completed every task."
            : `${completed} of ${all} tasks completed. Keep going!`;
    $("#sessionCount").textContent = sessions;

    $$(".nav[data-filter]").forEach(button =>
        button.classList.toggle("active", button.dataset.filter === currentFilter));
    $$(".category-tab").forEach(button =>
        button.classList.toggle("active", button.dataset.category === currentCategory));
}

function resetForm() {
    editingId = null;
    $("#taskForm").reset();
    $("#taskDeadline").value = "";
    $("#formHeading").textContent = "Create a new task";
    $("#submitTask").textContent = "＋ Add task";
    $("#cancelEdit").classList.add("hidden");
}

function startEdit(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    editingId = id;
    $("#taskTitle").value = task.title;
    $("#taskCategory").value = task.category;
    $("#taskPriority").value = task.priority;
    $("#taskDeadline").value = task.deadline;
    $("#formHeading").textContent = "Edit your task";
    $("#submitTask").textContent = "Save changes";
    $("#cancelEdit").classList.remove("hidden");
    $("#taskTitle").focus();
    $("#taskForm").scrollIntoView({ behavior: "smooth", block: "center" });
}

$("#taskForm").addEventListener("submit", event => {
    event.preventDefault();
    const title = $("#taskTitle").value.trim();
    if (!title) return;

    const deadline = $("#taskDeadline").value;
    if (deadline && Number.isNaN(new Date(`${deadline}T00:00:00`).getTime())) {
        showToast("Please choose a valid deadline.");
        return;
    }

    if (editingId) {
        const task = tasks.find(t => t.id === editingId);
        if (task) {
            task.title = title;
            task.category = $("#taskCategory").value;
            task.priority = $("#taskPriority").value;
            task.deadline = deadline;
        }
        showToast("Task updated successfully.");
    } else {
        tasks.push({
            id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
            title,
            category: $("#taskCategory").value,
            priority: $("#taskPriority").value,
            deadline,
            status: "todo",
            createdAt: Date.now()
        });
        showToast("New task added!");
    }

    saveTasks();
    resetForm();
    currentFilter = "all";
    renderTasks();
});

$("#cancelEdit").addEventListener("click", resetForm);
$("#searchInput").addEventListener("input", renderTasks);
$("#priorityFilter").addEventListener("change", renderTasks);

$$(".nav[data-filter]").forEach(button => {
    button.addEventListener("click", () => {
        currentFilter = button.dataset.filter;
        renderTasks();
    });
});

$$(".category-tab").forEach(button => {
    button.addEventListener("click", () => {
        currentCategory = button.dataset.category;
        renderTasks();
    });
});

$("#taskList").addEventListener("change", event => {
    const checkbox = event.target.closest('[data-action="complete"]');
    if (!checkbox) return;

    const task = tasks.find(t => t.id === checkbox.dataset.id);
    if (!task) return;

    task.status = checkbox.checked ? "completed" : "todo";
    saveTasks();
    renderTasks();
    showToast(task.status === "completed" ? "Task completed! 🎉" : "Task moved to to-do.");
});

$("#taskList").addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (action === "edit") {
        startEdit(id);
    } else if (action === "delete") {
        if (!confirm(`Delete "${task.title}"?`)) return;
        tasks = tasks.filter(t => t.id !== id);
        if (editingId === id) resetForm();
        saveTasks();
        renderTasks();
        showToast("Task deleted.");
    } else if (action === "status") {
        task.status = task.status === "todo" ? "progress"
            : task.status === "progress" ? "completed" : "todo";
        saveTasks();
        renderTasks();
        showToast(`Status changed to ${task.status === "todo" ? "To-do" : task.status === "progress" ? "In progress" : "Completed"}.`);
    }
});

$("#addTaskTop").addEventListener("click", () => {
    $("#taskTitle").focus();
    $("#taskForm").scrollIntoView({ behavior: "smooth", block: "center" });
});
$("#welcomeAdd").addEventListener("click", () => $("#addTaskTop").click());

function applyTheme(theme) {
    document.body.classList.toggle("light", theme === "light");
    localStorage.setItem(THEME_KEY, theme);
    $("#themeBtn").innerHTML = theme === "light"
        ? "☾ <span>Switch to dark</span>"
        : "☼ <span>Switch to light</span>";
}
applyTheme(localStorage.getItem(THEME_KEY) || "dark");
$("#themeBtn").addEventListener("click", () => {
    applyTheme(document.body.classList.contains("light") ? "dark" : "light");
});

$("#exportBtn").addEventListener("click", () => {
    if (!tasks.length) {
        showToast("Add a task before exporting.");
        return;
    }

    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "taskflow-pro-tasks.json";
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Tasks exported as JSON.");
});

// Pomodoro focus timer
function updateTimerDisplay() {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    $("#timerDisplay").textContent =
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    const total = selectedMinutes * 60;
    $("#timerBar").style.width = `${Math.max(0, Math.min(100, (total - remainingSeconds) / total * 100))}%`;
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    timerRunning = false;
    $("#timerStart").textContent = "▶ Start";
}

function selectTimer(minutes) {
    stopTimer();
    selectedMinutes = minutes;
    remainingSeconds = minutes * 60;
    $$(".mode-btn").forEach(button =>
        button.classList.toggle("active", Number(button.dataset.minutes) === minutes));
    updateTimerDisplay();
}

$$(".mode-btn").forEach(button => {
    button.addEventListener("click", () => selectTimer(Number(button.dataset.minutes)));
});

$("#timerStart").addEventListener("click", () => {
    if (timerRunning) {
        stopTimer();
        return;
    }

    if (remainingSeconds <= 0) remainingSeconds = selectedMinutes * 60;
    timerRunning = true;
    $("#timerStart").textContent = "Ⅱ Pause";

    timerInterval = setInterval(() => {
        remainingSeconds--;
        updateTimerDisplay();

        if (remainingSeconds <= 0) {
            stopTimer();
            if (selectedMinutes === 25) {
                sessions++;
                localStorage.setItem(SESSION_KEY, String(sessions));
                renderTasks();
            }
            showToast(selectedMinutes === 25
                ? "Focus session complete! Take a break. 🎉"
                : "Timer complete! Nice work.");
            if ("Notification" in window && Notification.permission === "granted") {
                new Notification("TaskFlow Pro", {
                    body: "Your timer is complete!"
                });
            }
        }
    }, 1000);
});

$("#timerReset").addEventListener("click", () => {
    selectTimer(selectedMinutes);
    showToast("Timer reset.");
});

$("#sidebarFocus").addEventListener("click", () => {
    $("#focusPanel").scrollIntoView({ behavior: "smooth", block: "center" });
    if (!timerRunning && remainingSeconds > 0) $("#timerStart").click();
});

$("#todayDate").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
}).toUpperCase();

$("#year").textContent = new Date().getFullYear();

renderTasks();
updateTimerDisplay();
