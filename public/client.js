document.addEventListener('DOMContentLoaded', () => {
    const taskForm = document.getElementById('taskForm');
    const taskListDiv = document.getElementById('taskList');
    const refreshTasksButton = document.getElementById('refreshTasks');

    const API_BASE_URL = '/api/tasks';

    // Function to fetch and display tasks
    async function fetchTasks() {
        try {
            const response = await fetch(API_BASE_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const tasks = await response.json();
            renderTasks(tasks);
        } catch (error) {
            taskListDiv.innerHTML = `<p>Error loading tasks: ${error.message}</p>`;
            console.error('Error fetching tasks:', error);
        }
    }

    // Function to render tasks in the UI
    function renderTasks(tasks) {
        if (!tasks || Object.keys(tasks).length === 0) {
            taskListDiv.innerHTML = '<p>No tasks submitted yet.</p>';
            return;
        }

        taskListDiv.innerHTML = ''; // Clear current tasks

        // Sort tasks by submission time (newest first, assuming logs have timestamps)
        const sortedTaskIds = Object.keys(tasks).sort((a, b) => {
            const taskAFirstLog = tasks[a].executionLogs[0] || '';
            const taskBFirstLog = tasks[b].executionLogs[0] || '';
            // Extract timestamp (e.g., [2024-07-15T10:00:00.000Z])
            const timeA = new Date(taskAFirstLog.substring(1, taskAFirstLog.indexOf(']'))).getTime();
            const timeB = new Date(taskBFirstLog.substring(1, taskBFirstLog.indexOf(']'))).getTime();
            return (timeB || 0) - (timeA || 0); // Handle cases where logs might be empty
        });


        for (const taskId of sortedTaskIds) {
            const task = tasks[taskId];
            const taskElement = document.createElement('div');
            taskElement.classList.add('task', task.status);
            taskElement.innerHTML = `
                <h3>Task ID: ${task.taskId}</h3>
                <p><strong>Status:</strong> ${task.status.replace('_', ' ')}</p>
                <p><strong>Summary:</strong> ${task.summary}</p>
                ${task.pullRequestUrl ? `<p><strong>PR URL:</strong> <a href="${task.pullRequestUrl}" target="_blank">${task.pullRequestUrl}</a></p>` : ''}
                ${task.errorMessage ? `<p><strong>Error:</strong> ${task.errorMessage}</p>` : ''}
                ${task.diff ? `<h4>Diff:</h4><pre>${escapeHtml(task.diff)}</pre>` : ''}
                <h4>Logs:</h4>
                <div class="logs">
                    ${task.executionLogs.map(log => `<div class="log-entry">${escapeHtml(log)}</div>`).join('')}
                </div>
            `;
            taskListDiv.appendChild(taskElement);
        }
    }

    // Function to handle task form submission
    taskForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(taskForm);
        const taskRequest = {
            repoUrl: formData.get('repoUrl'),
            branch: formData.get('branch'),
            taskDescription: formData.get('taskDescription'),
            setupScripts: formData.get('setupScripts') ? formData.get('setupScripts').split(',').map(s => s.trim()).filter(s => s) : [],
        };

        try {
            const response = await fetch(API_BASE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(taskRequest),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Failed to submit task. No error details.' }));
                throw new Error(`Failed to submit task: ${errorData.message || response.statusText}`);
            }

            const result = await response.json();
            alert(`Task submitted successfully! Task ID: ${result.taskId}`);
            taskForm.reset(); // Reset form
            fetchTasks(); // Refresh task list
        } catch (error) {
            alert(`Error submitting task: ${error.message}`);
            console.error('Error submitting task:', error);
        }
    });

    // Event listener for the refresh button
    refreshTasksButton.addEventListener('click', fetchTasks);

    // Initial load of tasks
    fetchTasks();

    // Poll for task updates every 5 seconds
    setInterval(fetchTasks, 5000);

    // Utility to escape HTML to prevent XSS when displaying content
    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
});
