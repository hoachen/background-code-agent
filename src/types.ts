// src/types.ts

/**
 * Defines the structure for a task request.
 */
export interface TaskRequest {
  repoUrl: string;
  branch: string;
  taskDescription: string;
  setupScripts?: string[]; // Optional array of setup script commands
}

/**
 * Defines the possible states of a task.
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * Defines the structure for a task result.
 */
export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  summary: string;
  diff?: string; // Simulated code differences
  executionLogs: string[];
  pullRequestUrl?: string; // Simulated Pull Request URL
  errorMessage?: string; // Error message if the task failed
}

/**
 * Represents a mock file system.
 * The key is the file path, and the value is the file content.
 */
export interface MockFileSystem {
  [filePath: string]: string;
}
