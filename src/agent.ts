// src/agent.ts

import { v4 as uuidv4 } from 'uuid';
import { TaskRequest, TaskResult, TaskStatus, MockFileSystem } from './types';

export class BackgroundCodeAgent {
  private tasks: Map<string, TaskResult> = new Map();
  private mockFileSystem: MockFileSystem = {};

  constructor() {
    this.initializeMockFileSystem();
  }

  private initializeMockFileSystem(): void {
    this.mockFileSystem['src/utils.ts'] = `
export function formatDate(date: Date): string {
  // Simulate a bug: incorrect date formatting
  return date.toISOString().substring(0, 10);
}

export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`;
    this.mockFileSystem['src/components/Button.tsx'] = `
import React from 'react'; // Assume React is available for type checking

interface ButtonProps {
  label: string;
  onClick?: () => void;
}

const Button: React.FC<ButtonProps> = ({ label, onClick }) => {
  return (
    <button onClick={onClick}>
      {label}
    </button>
  );
};

export default Button;
`;
    this.mockFileSystem['tests/utils.test.ts'] = `
// import { formatDate } from '../src/utils'; // Path for actual execution

describe('formatDate', () => {
  it('should format date correctly', () => {
    const date = new Date(2023, 0, 1); // Jan 1, 2023
    // Expected: '2023-01-01'
    // Current (buggy): '2023-01-01' (but from toISOString, might be timezone issues in real scenarios)
    // No assertion here yet, to be added by agent task
  });
});
`;
  }

  public submitTask(request: TaskRequest): string {
    const taskId = uuidv4();
    const initialResult: TaskResult = {
      taskId,
      status: 'pending',
      summary: `Task "${request.taskDescription}" received.`,
      executionLogs: [`[${new Date().toISOString()}] Task submitted: ${request.taskDescription}`],
    };
    this.tasks.set(taskId, initialResult);

    // Process the task asynchronously
    this.processTask(taskId, request).catch(err => {
        // Fallback error logging if processTask itself throws an unhandled synchronous error
        // (though it's designed to handle errors internally and update task status)
        console.error(`[Agent] Critical error processing task ${taskId}:`, err);
        const taskEntry = this.tasks.get(taskId);
        if (taskEntry) {
            taskEntry.status = 'failed';
            taskEntry.summary = 'Critical agent error during task processing.';
            taskEntry.errorMessage = err instanceof Error ? err.message : String(err);
            taskEntry.executionLogs.push(`[${new Date().toISOString()}] Critical agent error: ${taskEntry.errorMessage}`);
        }
    });

    return taskId;
  }

  public getTaskStatus(taskId: string): TaskResult | undefined {
    return this.tasks.get(taskId);
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

  private generateDiff(filePath: string, oldContent: string, newContent: string): string {
    const oldLines = oldContent.split('\\n');
    const newLines = newContent.split('\\n');
    let diffString = `--- a/${filePath}\\n+++ b/${filePath}\\n`;

    // This is a simplified diff, only showing lines that were part of the change.
    // A more sophisticated diff would use a proper algorithm (e.g., Myers).
    const maxLines = Math.max(oldLines.length, newLines.length);
    let linesCompared = 0;
    for (let i = 0; i < maxLines; i++) {
        if (linesCompared > 20 && i < maxLines - 5) { // Limit diff context for long files
            if (i === Math.floor(maxLines/2)) diffString += `... (diff truncated for brevity) ...\\n`;
            continue;
        }
        if (oldLines[i] !== newLines[i]) {
            if (i < oldLines.length) {
                diffString += `- ${oldLines[i]}\\n`;
            }
            if (i < newLines.length) {
                diffString += `+ ${newLines[i]}\\n`;
            }
            linesCompared++;
        } else if (i < newLines.length) {
            // context lines, could be added but make diff long
            // diffString += `  ${newLines[i]}\\n`;
        }
    }
    if (diffString === `--- a/${filePath}\\n+++ b/${filePath}\\n`) {
        return "No textual changes detected or change too complex for simple diff.";
    }
    return diffString;
  }

  private async processTask(taskId: string, request: TaskRequest): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.error(`Task ${taskId} not found for processing.`);
      return;
    }

    task.status = 'in_progress';
    this.log(taskId, `Processing started for task: ${request.taskDescription}`);

    // Create a task-specific file system anapshot
    const taskFileSystem: MockFileSystem = JSON.parse(JSON.stringify(this.mockFileSystem));

    try {
      this.log(taskId, `Simulating repository clone for ${request.repoUrl} on branch ${request.branch}...`);
      await this.simulateDelay(1000);

      if (request.setupScripts && request.setupScripts.length > 0) {
        this.log(taskId, 'Starting environment setup...');
        for (const script of request.setupScripts) {
          this.log(taskId, `Executing setup script: ${script}`);
          await this.simulateDelay(1500);
          if (script.toLowerCase().includes('fail_setup') || script.toLowerCase().includes('fail')) {
            throw new Error(`Simulated failure in setup script: "${script}"`);
          }
        }
        this.log(taskId, 'Environment setup completed successfully.');
      }

      this.log(taskId, 'Analyzing code...');
      await this.simulateDelay(1500);

      this.log(taskId, 'Generating modification plan based on description...');
      await this.simulateDelay(1000);
      // In a real agent, this step would involve more complex NLP and planning.

      this.log(taskId, 'Applying modifications...');
      let modificationSummary = 'No specific modifications applied based on description.';
      let diffOutput = '';

      // Simple keyword-based modification logic
      const desc = request.taskDescription.toLowerCase();
      const filePathMatch = request.taskDescription.match(/(src\/[\w./-]+\.tsx?|tests\/[\w./-]+\.test\.tsx?)/);
      const targetFile = filePathMatch ? filePathMatch[0] : undefined;

      if (targetFile && taskFileSystem[targetFile]) {
        const originalContent = taskFileSystem[targetFile];
        let newContent = originalContent;

        if (desc.includes('fix') && desc.includes('bug') && targetFile === 'src/utils.ts' && desc.includes('date format')) {
          newContent = originalContent.replace(
            'date.toISOString().substring(0, 10);',
            "date.toLocaleDateString('en-CA'); // Patched to use 'en-CA' for yyyy-mm-dd format"
          );
          modificationSummary = `Successfully patched date formatting bug in ${targetFile}.`;
        } else if (desc.includes('add') && desc.includes('handler') && targetFile === 'src/components/Button.tsx' && desc.includes('click event')) {
          if (newContent.includes('onClick?: () => void;')) { // check if it's the Button component
             newContent = newContent.replace(
                'const Button: React.FC<ButtonProps> = ({ label, onClick }) => {',
                `const Button: React.FC<ButtonProps> = ({ label, onClick }) => {
  const internalClickHandler = () => {
    console.log('Button "${label}" clicked!');
    if (onClick) onClick();
  };`
            ).replace(
                '<button onClick={onClick}>',
                '<button onClick={internalClickHandler}>'
            );
            modificationSummary = `Added a click event handler to Button component in ${targetFile}.`;
          }
        } else if (desc.includes('add') && desc.includes('test') && targetFile && targetFile.startsWith('tests/')) {
          if (desc.includes('formatdate') && targetFile === 'tests/utils.test.ts') {
            newContent = newContent.replace(
              '// No assertion here yet, to be added by agent task',
              "expect(formatDate(new Date(2023,0,1))).toBe('2023-01-01'); // Assertion added by agent"
            );
            modificationSummary = `Added test assertion for formatDate in ${targetFile}.`;
          } else {
            newContent += `\nit('should handle another scenario generated by agent', () => {\n  expect(true).toBe(true); // Placeholder test\n});\n`;
            modificationSummary = `Added a new placeholder test scenario in ${targetFile}.`;
          }
        } else {
            this.log(taskId, `No specific modification rule matched for file ${targetFile} and description.`);
            modificationSummary = `Generic code scan performed on ${targetFile}, no specific rule applied.`;
        }

        if (originalContent !== newContent) {
            taskFileSystem[targetFile] = newContent;
            diffOutput = this.generateDiff(targetFile, originalContent, newContent);
            this.log(taskId, `Modifications applied to ${targetFile}.`);
        } else {
            this.log(taskId, `No textual changes made to ${targetFile} based on rules.`);
        }

      } else if (targetFile) {
        this.log(taskId, `Warning: Target file ${targetFile} not found in mock file system.`);
        modificationSummary = `Could not find target file ${targetFile} for modifications.`;
      }


      if (desc.includes('conflict')) {
        this.log(taskId, 'Simulating a code conflict...');
        await this.simulateDelay(500);
        throw new Error('Simulated code conflict during modification application.');
      }

      this.log(taskId, 'Running tests (simulated)...');
      await this.simulateDelay(2000);
      const testsPass = !desc.includes('fail test');
      if (testsPass) {
        this.log(taskId, 'All simulated tests passed.');
      } else {
        this.log(taskId, 'Simulated test failure.');
        throw new Error('One or more simulated tests failed.');
      }

      task.status = 'completed';
      task.summary = modificationSummary;
      if (diffOutput) task.diff = diffOutput;
      task.pullRequestUrl = `https://github.com/${request.repoUrl}/pull/${Math.floor(Math.random() * 1000) + 1}`;
      this.log(taskId, `Task completed successfully. PR URL: ${task.pullRequestUrl}`);

    } catch (error: any) {
      this.log(taskId, `Error during task processing: ${error.message}`);
      task.status = 'failed';
      task.summary = `Task failed: ${error.message}`;
      task.errorMessage = error.message;
    }
  }

  public setMockFileContent(filePath: string, content: string): void {
    this.mockFileSystem[filePath] = content;
    // Note: This affects the base mock FS. Tasks already in progress will have their own snapshot.
  }

  public getMockFileContent(filePath: string): string | undefined {
      return this.mockFileSystem[filePath];
  }
}
