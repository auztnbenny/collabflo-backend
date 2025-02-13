// // backend/src/services/WorkspaceManager.ts
// import fs from 'fs';
// import path from 'path';
// import { spawn, type ChildProcess } from 'child_process';

// // backend/src/services/WorkspaceManager.ts
// // backend/src/services/WorkspaceManager.ts
// export class WorkspaceManager {
//   private baseDir: string;

//   constructor() {
//       // Create workspaces directory in your backend root
//       this.baseDir = path.join(process.cwd(), 'workspaces');
//       if (!fs.existsSync(this.baseDir)) {
//           fs.mkdirSync(this.baseDir, { recursive: true });
//       }
//   }

//   async executeCommand(roomId: string, command: string): Promise<string> {
//       // Create room-specific workspace
//       const workspacePath = path.join(this.baseDir, roomId);
//       if (!fs.existsSync(workspacePath)) {
//           fs.mkdirSync(workspacePath, { recursive: true });
//       }

//       console.log(`Executing command in ${workspacePath}:`, command);

//       return new Promise((resolve, reject) => {
//           const childProcess = spawn(command, [], {
//               shell: true,
//               cwd: workspacePath,
//               env: { ...process.env }
//           });

//           let output = '';

//           childProcess.stdout?.on('data', (data) => {
//               output += data.toString();
//           });

//           childProcess.stderr?.on('data', (data) => {
//               output += data.toString();
//           });

//           childProcess.on('close', (code) => {
//               if (code === 0) {
//                   resolve(output);
//               } else {
//                   reject(new Error(`Process exited with code ${code}\n${output}`));
//               }
//           });
//       });
//   }
// }