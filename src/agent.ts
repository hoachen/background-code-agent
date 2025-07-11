// src/agent.ts

import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TaskRequest, TaskResult, TaskStatus, MockFileSystem } from './types';

// Utility function to promisify exec
const execPromise = (command: string, options?: any) => {
  return new Promise<{ stdout: string, stderr: string, error?: Error | null }>((resolve) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        // Log the actual error object here for system-level debugging
        console.error(`[execPromise] Error executing command "${command}":`, error);
        // Resolve with the error object along with stdout and stderr
        resolve({ stdout, stderr, error });
        return;
      }
      resolve({ stdout, stderr, error: null });
    });
  });
};


export class BackgroundCodeAgent {
  private tasks: Map<string, TaskResult> = new Map();
  // private mockFileSystem: MockFileSystem = {}; // Replaced by actual file system operations

  constructor() {
    // this.initializeMockFileSystem(); // No longer needed as we use actual repo clones
  }

  // private initializeMockFileSystem(): void { ... } // Removed

  public submitTask(request: TaskRequest): string {
    const taskId = uuidv4();
    // Create a temporary directory for this task
    const taskWorkspaceDir = path.join(__dirname, '..', 'workspaces', taskId);
    const initialResult: TaskResult = {
      taskId,
      status: 'pending',
      summary: `Task "${request.taskDescription}" received.`,
      executionLogs: [`[${new Date().toISOString()}] Task submitted: ${request.taskDescription}`],
      workspacePath: taskWorkspaceDir, // Store workspace path
    };
    this.tasks.set(taskId, initialResult);

    // Process the task asynchronously
    this.processTask(taskId, request, taskWorkspaceDir).catch(async err => {
        console.error(`[Agent] Critical error processing task ${taskId}:`, err);
        const taskEntry = this.tasks.get(taskId);
        if (taskEntry) {
            taskEntry.status = 'failed';
            taskEntry.summary = 'Critical agent error during task processing.';
            taskEntry.errorMessage = err instanceof Error ? err.message : String(err);
            taskEntry.executionLogs.push(`[${new Date().toISOString()}] Critical agent error: ${taskEntry.errorMessage}`);
        }
        // Attempt to clean up workspace directory on critical failure
        try {
            await fs.rm(taskWorkspaceDir, { recursive: true, force: true });
            this.log(taskId, `Cleaned up workspace: ${taskWorkspaceDir}`);
        } catch (cleanupError) {
            this.log(taskId, `Error cleaning up workspace ${taskWorkspaceDir}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
        }
    });

    return taskId;
  }

  public getTaskStatus(taskId: string): TaskResult | undefined {
    return this.tasks.get(taskId);
  }

  public getAllTasks(): { [taskId: string]: TaskResult } {
    return Object.fromEntries(this.tasks);
  }

  private log(taskId: string, message: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      const logMessage = `[${new Date().toISOString()}] ${message}`;
      task.executionLogs.push(logMessage);
      console.log(`[TaskID: ${taskId}] ${message}`); // Also log to console for real-time feedback
      // No need to this.tasks.set here repeatedly, as the object reference is the same.
      // We update the status object directly.
    }
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // private generateDiff(filePath: string, oldContent: string, newContent: string): string { ... } // Replaced by git diff

  private async processTask(taskId: string, request: TaskRequest, taskWorkspaceDir: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.error(`Task ${taskId} not found for processing.`);
      return;
    }

    task.status = 'in_progress';
    this.log(taskId, `Processing started for task: ${request.taskDescription}`);
    this.log(taskId, `Workspace: ${taskWorkspaceDir}`);

    try {
      // 1. Create workspace and clone repository
      await fs.mkdir(taskWorkspaceDir, { recursive: true });
      this.log(taskId, `Created workspace directory: ${taskWorkspaceDir}`);

      const cloneUrl = request.repoUrl.startsWith('http') ? request.repoUrl : `https://github.com/${request.repoUrl}.git`;
      this.log(taskId, `Cloning repository ${cloneUrl} (branch: ${request.branch})...`);
      const cloneResult = await execPromise(
        `git clone --branch ${request.branch} --depth 1 ${cloneUrl} .`,
        { cwd: taskWorkspaceDir }
      );

      if (cloneResult.error) {
        this.log(taskId, `Git clone command failed to execute: ${cloneResult.error.message}`);
        this.log(taskId, `Git clone stdout: ${cloneResult.stdout}`);
        this.log(taskId, `Git clone stderr: ${cloneResult.stderr}`);
        throw new Error(`Git clone command execution failed: ${cloneResult.error.message}`);
      }
      // Check stderr for actual clone failure, as git clone can use stderr for progress/warnings.
      // A common success message in stderr is "Cloning into '.'..."
      if (cloneResult.stderr && !cloneResult.stderr.toLowerCase().includes('cloning into') && !cloneResult.stderr.toLowerCase().includes('already exists')) {
        try {
            await fs.access(path.join(taskWorkspaceDir, '.git'));
            this.log(taskId, `Git clone completed with warnings/info: ${cloneResult.stderr}`);
        } catch (gitAccessError) {
            this.log(taskId, `Git clone likely failed. .git directory not found. Stdout: ${cloneResult.stdout}`);
            this.log(taskId, `Git clone stderr: ${cloneResult.stderr}`);
            throw new Error(`Git clone failed: ${cloneResult.stderr || cloneResult.stdout || 'Unknown clone error'}`);
        }
      } else {
        this.log(taskId, `Git clone successful. Output (stdout/stderr):\n${cloneResult.stdout || cloneResult.stderr}`);
      }

      // 2. Run setup scripts (if any)
      if (request.setupScripts && request.setupScripts.length > 0) {
        this.log(taskId, 'Starting environment setup...');
        for (const script of request.setupScripts) {
          this.log(taskId, `Executing setup script: ${script}`);
          const scriptResult = await execPromise(script, { cwd: taskWorkspaceDir });

          this.log(taskId, `Script stdout:\n${scriptResult.stdout}`);
          if (scriptResult.stderr) {
            this.log(taskId, `Script stderr:\n${scriptResult.stderr}`);
          }

          if (scriptResult.error) {
            throw new Error(`Setup script "${script}" failed to execute: ${scriptResult.error.message}. Stderr: ${scriptResult.stderr}`);
          }
          // Heuristic for script failure based on stderr content or specific keywords
          if (scriptResult.stderr && (scriptResult.stderr.toLowerCase().includes('error') || scriptResult.stderr.toLowerCase().includes('failed'))) {
            if (!script.toLowerCase().includes('fail_setup')) { // Don't throw if it was a known failing script for testing
                 this.log(taskId, `Warning: Setup script "${script}" produced error messages in stderr.`);
            } else {
                 throw new Error(`Simulated failure in setup script: "${script}" (due to fail_setup keyword). Stderr: ${scriptResult.stderr}`);
            }
          }
           if (script.toLowerCase().includes('fail_setup')) { // explicit fail trigger
                throw new Error(`Simulated failure in setup script: "${script}" (due to fail_setup keyword). Stderr: ${scriptResult.stderr}`);
           }
        }
        this.log(taskId, 'Environment setup completed.');
      } else {
        this.log(taskId, 'No setup scripts to run.');
      }

      // 3. Apply modifications using Gemini CLI
      this.log(taskId, 'Attempting code modification with Gemini CLI...');
      this.log(taskId, 'Note: Gemini CLI may require a GEMINI_API_KEY environment variable to be set.');
      const geminiCommand = `npx @google/gemini-cli "${request.taskDescription.replace(/"/g, '\\"')}"`; // Escape quotes in description
      this.log(taskId, `Executing Gemini CLI: ${geminiCommand}`);

      const geminiResult = await execPromise(geminiCommand, {
        cwd: taskWorkspaceDir,
        // env: { ...process.env, GEMINI_API_KEY: 'YOUR_API_KEY_IF_NEEDED' } // Example if key needs to be passed explicitly
      });

      this.log(taskId, `Gemini CLI stdout:\n${geminiResult.stdout}`);
      if (geminiResult.stderr) {
        this.log(taskId, `Gemini CLI stderr:\n${geminiResult.stderr}`);
      }

      if (geminiResult.error) {
        // Gemini CLI command itself failed to execute (e.g., command not found, crash)
        throw new Error(`Gemini CLI command execution failed: ${geminiResult.error.message}. Stderr: ${geminiResult.stderr}`);
      }
      // Further checks for Gemini CLI success can be added here based on its typical output for errors vs success.
      // For example, if Gemini CLI indicates an error via stderr even with exit code 0:
      if (geminiResult.stderr && (geminiResult.stderr.toLowerCase().includes("error") || geminiResult.stderr.toLowerCase().includes("failed"))) {
          this.log(taskId, "Gemini CLI reported errors in stderr. Treating as potential failure.");
          // Decide if this should throw an error or just be a warning. For now, log and proceed.
          // throw new Error(`Gemini CLI reported errors: ${geminiResult.stderr}`);
      }


      let modificationSummary = `Modifications attempted by Gemini CLI. Output: ${geminiResult.stdout.substring(0, 300)}...`;
      if (geminiResult.stdout.length > 300) modificationSummary += " (truncated)";


      // 4. Generate diff of changes
      this.log(taskId, 'Generating diff of changes using "git diff HEAD"...');
      const diffResult = await execPromise('git diff HEAD', { cwd: taskWorkspaceDir });

      if (diffResult.error) {
         this.log(taskId, `git diff command execution failed: ${diffResult.error.message}`);
         task.diff = "Error generating diff.";
      } else {
        if (diffResult.stderr) {
            this.log(taskId, `Git diff stderr: ${diffResult.stderr}`);
        }
        task.diff = diffResult.stdout || "No textual changes detected by git diff.";
      }
      this.log(taskId, `Diff generated. Length: ${task.diff.length}`);

      if (!task.diff || task.diff === "No textual changes detected by git diff." || task.diff.trim() === "") {
          modificationSummary = "Gemini CLI ran, but no file changes were detected by git diff.";
          this.log(taskId, modificationSummary);
      } else {
          modificationSummary = `Gemini CLI applied changes. Diff length: ${task.diff.length}`;
      }


      // 5. Simulate running tests
      this.log(taskId, 'Running tests (simulated)...');
      await this.simulateDelay(1000);
      const shouldFailTest = request.taskDescription.toLowerCase().includes('fail test');
      if (shouldFailTest) {
        this.log(taskId, 'Simulated test failure based on task description.');
        throw new Error('One or more simulated tests failed as per task description.');
      } else {
        this.log(taskId, 'All simulated tests passed.');
      }

      task.status = 'completed';
      task.summary = modificationSummary;
      task.pullRequestUrl = `https://github.com/${request.repoUrl.replace(/\.git$/, '')}/pull/${Math.floor(Math.random() * 1000) + 1}`;
      this.log(taskId, `Task completed successfully. PR URL: ${task.pullRequestUrl}`);

    } catch (error: any) {
      this.log(taskId, `ERROR during task processing: ${error.message}`);
      // error.stderr and error.stdout might be available if the error originated from a failed execPromise
      if (error.stderr) {
        this.log(taskId, `Captured Stderr from failed command: ${error.stderr}`);
      }
      if (error.stdout) {
        this.log(taskId, `Captured Stdout from failed command: ${error.stdout}`);
      }
      task.status = 'failed';
      task.summary = `Task failed: ${error.message.substring(0, 500)}`; // Cap summary length
      task.errorMessage = error.message;
    } finally {
        // 6. Cleanup workspace
        this.log(taskId, `Attempting to clean up workspace: ${taskWorkspaceDir}...`);
        try {
            await fs.rm(taskWorkspaceDir, { recursive: true, force: true });
            this.log(taskId, `Successfully cleaned up workspace: ${taskWorkspaceDir}`);
        } catch (cleanupError) {
            this.log(taskId, `Error cleaning up workspace ${taskWorkspaceDir}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
        }
    }
  }

  // public setMockFileContent(filePath: string, content: string): void { ... } // Removed
  // public getMockFileContent(filePath: string): string | undefined { ... } // Removed
}
