// src/main.ts

import { BackgroundCodeAgent } from './agent';
import { TaskRequest } from './types';

async function main() {
  console.log('Initializing Background Code Agent...');
  const agent = new BackgroundCodeAgent();
  console.log('Agent Initialized.\n');

  const tasksToSubmit: TaskRequest[] = [
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
    },
    {
      repoUrl: 'torvalds/linux',
      branch: 'master',
      taskDescription: 'This task should fail during setup script execution.',
      setupScripts: ['make config', 'make modules_install_fail_setup'],
    },
    {
      repoUrl: 'openai/gpt-3',
      branch: 'feature/new-model',
      taskDescription: 'Implement a new feature that will cause a code conflict.',
    },
    {
      repoUrl: 'tensorflow/tensorflow',
      branch: 'r2.10',
      taskDescription: 'This task should fail test execution.',
      setupScripts: ['bazel build //...'],
    }
  ];

  const taskIds: string[] = [];

  console.log('--- Submitting Tasks ---');
  for (const taskRequest of tasksToSubmit) {
    console.log(`Submitting task: "${taskRequest.taskDescription}"`);
    const taskId = agent.submitTask(taskRequest);
    taskIds.push(taskId);
    console.log(`Task submitted with ID: ${taskId}\n`);
  }

  console.log(`--- All ${taskIds.length} tasks submitted. Waiting for processing (simulated ~20s) ---`);
  // Simulate waiting for tasks to be processed in the "background"
  await new Promise(resolve => setTimeout(resolve, 20000));

  console.log('\n--- Checking Final Task Statuses ---');
  for (const taskId of taskIds) {
    const status = agent.getTaskStatus(taskId);
    if (status) {
      console.log(`\n-----------------------------------------`);
      console.log(`Status for Task ID: ${status.taskId}`);
      console.log(`  Status: ${status.status}`);
      console.log(`  Summary: ${status.summary}`);
      if (status.diff) {
        console.log(`  Diff:\n${status.diff.split('\\n').map(line => `    ${line}`).join('\n')}`);
      }
      if (status.pullRequestUrl) {
        console.log(`  PR URL: ${status.pullRequestUrl}`);
      }
      if (status.errorMessage) {
        console.log(`  Error Message: ${status.errorMessage}`);
      }
      console.log(`  Execution Logs:`);
      status.executionLogs.forEach(log => console.log(`    ${log}`));
      console.log(`-----------------------------------------`);
    } else {
      console.log(`\n-----------------------------------------`);
      console.log(`Status for Task ID ${taskId}: Not found (this should not happen)`);
      console.log(`-----------------------------------------`);
    }
  }
  console.log('\nAll task checks complete.');
}

main().catch(error => {
  console.error("Critical error in main execution:", error);
});
