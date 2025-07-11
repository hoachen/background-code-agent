// src/main.ts

import express from 'express';
import path from 'path';
import { BackgroundCodeAgent } from './agent';
import { TaskRequest } from './types';

const app = express();
const port = process.env.PORT || 3000;

const agent = new BackgroundCodeAgent();

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// API endpoint to submit a new task
app.post('/api/tasks', (req, res) => {
  const taskRequest: TaskRequest = req.body;

  // Basic validation
  if (!taskRequest || !taskRequest.repoUrl || !taskRequest.branch || !taskRequest.taskDescription) {
    return res.status(400).json({ message: 'Missing required task parameters: repoUrl, branch, taskDescription.' });
  }

  try {
    const taskId = agent.submitTask(taskRequest);
    // Submit some initial example tasks if the agent is new and has no tasks.
    // This is just for demo purposes so the UI isn't empty on first load.
    // Check a private property or method if it exists, or infer from task count.
    // For this example, let's assume if there's only 1 task (the one just submitted), we add more.
    if (agent.getAllTasks && Object.keys(agent.getAllTasks()).length <= 1) {
        submitInitialExampleTasks(agent);
    }
    res.status(201).json({ message: 'Task submitted successfully', taskId });
  } catch (error: any) {
    console.error('Error submitting task:', error);
    res.status(500).json({ message: 'Failed to submit task', error: error.message });
  }
});

// API endpoint to get the status of a specific task
app.get('/api/tasks/:taskId', (req, res) => {
  const { taskId } = req.params;
  const taskResult = agent.getTaskStatus(taskId);
  if (taskResult) {
    res.json(taskResult);
  } else {
    res.status(404).json({ message: 'Task not found' });
  }
});

// API endpoint to get all tasks
app.get('/api/tasks', (req, res) => {
  // We need a way to get all tasks from the agent.
  // Let's assume agent.ts will be modified to have a method like `getAllTasks()`
  if (agent.getAllTasks) {
    const allTasks = agent.getAllTasks();
    res.json(allTasks);
  } else {
    // Fallback or error if the method doesn't exist yet.
    // This will be addressed when modifying agent.ts
    console.warn('getAllTasks method not yet implemented on agent. Returning empty object for now.');
    res.json({});
  }
});

// Serve the index.html for any other GET request that doesn't match an API route or static file
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

function submitInitialExampleTasks(agentInstance: BackgroundCodeAgent) {
    console.log('Submitting initial example tasks for demonstration...');
    const exampleTasks: TaskRequest[] = [
      {
        repoUrl: 'gohugoio/hugo',
        branch: 'master',
        taskDescription: 'Fix the date formatting bug in src/utils.ts to use en-CA locale.',
        setupScripts: ['npm install', 'npm run lint-check'],
      },
      {
        repoUrl: 'facebook/react',
        branch: 'main',
        taskDescription: 'Add a new click event handler to the Button component in src/components/Button.tsx.',
        setupScripts: ['yarn install', 'yarn build:dev'],
      },
      {
        repoUrl: 'microsoft/TypeScript',
        branch: 'main',
        taskDescription: 'Add a test for formatDate in tests/utils.test.ts.',
      }
    ];

    exampleTasks.forEach(task => {
        try {
            agentInstance.submitTask(task);
        } catch (e) {
            console.error("Error submitting example task", e);
        }
    });
    console.log(`${exampleTasks.length} example tasks submitted.`);
}


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Agent Initialized and ready to accept tasks via API.');

  // Optionally, submit some initial tasks for demonstration when the server starts
  // This helps in having some data when the frontend loads for the first time.
  // Ensure this logic doesn't run repeatedly if the server restarts often during dev.
  // A proper check might involve seeing if tasks already exist.
  if (agent.getAllTasks && Object.keys(agent.getAllTasks()).length === 0) {
    submitInitialExampleTasks(agent);
  }
});

// Replace the old main function execution
// async function oldMain() {
//   console.log('Initializing Background Code Agent...');
//   const agent = new BackgroundCodeAgent();
//   console.log('Agent Initialized.\n');
//
//   // ... (old task submission logic) ...
//
//   console.log('\nAll task checks complete.');
// }
//
// oldMain().catch(error => {
//   console.error("Critical error in main execution:", error);
// });
