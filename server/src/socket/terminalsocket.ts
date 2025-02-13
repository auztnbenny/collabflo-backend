// src/socket/terminalSocket.ts
import { Server, Socket } from 'socket.io';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import * as Process from 'process';
import { SocketEvent } from '../types/socket';
import * as os from 'os';



interface reactTemplates {
    'package.json': string;
    'index.html': string;
    'src/App.tsx': string;
    'src/main.tsx': string;
    'src/vite-env.d.ts': string;
    'vite.config.ts': string;
    'tsconfig.json': string;
    'tsconfig.node.json': string;
    '.gitignore': string;
}
const reactTemplates = {
    'index.html': `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
    'package.json': `{
    "name": "my-react-app",
    "private": true,
    "version": "0.0.0",
    "type": "module",
    "scripts": {
        "dev": "vite",
        "build": "vite build",
        "preview": "vite preview"
    },
    "dependencies": {
        "react": "^18.2.0",
        "react-dom": "^18.2.0",
        "vite": "^4.4.5",
        "@vitejs/plugin-react": "^4.0.0"
    },
    "devDependencies": {
        "@types/react": "^18.2.0",
        "@types/react-dom": "^18.2.0",
        "typescript": "^5.0.2"
    }
}`,
    'src/App.tsx': `import React from 'react'
function App() {
    return (
        <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
            <div className="relative py-3 sm:max-w-xl sm:mx-auto">
                <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
                    <div className="max-w-md mx-auto">
                        <div className="divide-y divide-gray-200">
                            <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                                <h1 className="text-3xl font-bold text-gray-900 mb-8">Welcome to React</h1>
                                <p>Edit App.tsx and save to reload.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
export default App`,
    'src/main.tsx': `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><App /></React.StrictMode>
)`,
    'src/vite-env.d.ts': `/// <reference types="vite/client" />`,
    'vite.config.ts': `
    import { defineConfig } from 'vite'
    import react from '@vitejs/plugin-react'
    import path from 'path'
    
    export default defineConfig({
        plugins: [react()],
        server: {
            host: '0.0.0.0',
            port: 5174,
            strictPort: true,
            hmr: {
                clientPort: 5174
            }
        },
        build: {
            outDir: 'dist',
            emptyOutDir: true
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src')
            }
        }
    })`,
    'tsconfig.json': `{
        "compilerOptions": {
            "target": "ES2020",
            "useDefineForClassFields": true,
            "lib": ["ES2020", "DOM", "DOM.Iterable"],
            "module": "ESNext",
            "skipLibCheck": true,
            "moduleResolution": "bundler",
            "allowImportingTsExtensions": true,
            "resolveJsonModule": true,
            "isolatedModules": true,
            "noEmit": true,
            "jsx": "react-jsx",
            "strict": true,
            "noUnusedLocals": true,
            "noUnusedParameters": true,
            "noFallthroughCasesInSwitch": true
        },
        "include": ["src"],
        "references": [{ "path": "./tsconfig.node.json" }]
    }`,
    'tsconfig.node.json': `{
        "compilerOptions": {
            "composite": true,
            "skipLibCheck": true,
            "module": "ESNext",
            "moduleResolution": "bundler",
            "allowSyntheticDefaultImports": true
        },
        "include": ["vite.config.ts"]
    }`,
    '.gitignore': `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?`
};
interface TerminalCommand {
    command: string;
    cwd: string;
}

export function setupTerminalSocket(io: Server) {
    // Add at the start of setupTerminalSocket
    function getViteProjectPath(workspacePath: string, projectName: string) {
    return path.join(workspacePath, projectName);
}
    io.on('connection', (socket: Socket) => {
        let virtualDirectory = "/";
        let workspacePath = path.join(os.homedir(), 'CodeSyncProjects', 'default');
        let currentProjectPath = "";
        console.log('New terminal connection with ID:', socket.id);
        
        const initializeWorkspace = async () => {
            try {
                workspacePath = path.join(os.homedir(), 'CodeSyncProjects', 'default');
                await fs.mkdir(workspacePath, { recursive: true });
                console.log('Default workspace initialized at:', workspacePath);
            } catch (error) {
                console.error('Error initializing workspace:', error);
            }
        };

        // Initialize workspace when socket connects

        // socket.on(SocketEvent.JOIN_REQUEST, async ({ roomId: joinRoomId }) => {
        //     try {
        //         roomId = joinRoomId;
        //         workspacePath = await setupWorkspace(roomId);
        //         console.log(`Workspace setup at: ${workspacePath}`);
        //     } catch (error) {
        //         console.error('Error setting up workspace:', error);
        //     }
        // });
        socket.onAny((event, ...args) => {
            console.log('Received event:', event, 'with args:', args);
        });

        // Modify existing file creation handling
        socket.on(SocketEvent.FILE_CREATED, async ({ parentDirId, newFile }) => {
            try {
                const filePath = path.join(workspacePath, newFile.name);
                await fs.writeFile(filePath, newFile.content || '', 'utf-8'); // Add encoding
                
                console.log(`Created real file at: ${filePath}`);
                socket.emit('terminal:output', { data: `Created file: ${newFile.name}\n` });
            } catch (error) {
                console.error('Error creating file:', error);
                socket.emit('terminal:error', { error: 'Failed to create file' });
            }
        });

        // Handle directory creation
        socket.on(SocketEvent.FILE_DELETED, async ({ fileId, fileName }) => {
            try {
                const filePath = path.join(workspacePath, fileName);
                await fs.unlink(filePath);
                
                console.log(`Deleted file at: ${filePath}`);
            } catch (error) {
                console.error('Error deleting file:', error);
                socket.emit('terminal:error', { error: 'Failed to delete file' });
            }
        });

        // Handle file deletion
        socket.on(SocketEvent.FILE_DELETED, async ({ fileId, fileName }) => {
            try {
                const filePath = path.join(workspacePath, fileName);
                await fs.unlink(filePath);
                
                console.log(`Deleted file at: ${filePath}`);
            } catch (error) {
                console.error('Error deleting file:', error);
                socket.emit('terminal:error', { error: 'Failed to delete file' });
            }
        });

        // Handle directory deletion
        socket.on(SocketEvent.DIRECTORY_DELETED, async ({ dirId, dirName }) => {
            try {
                const dirPath = path.join(workspacePath, dirName);
                await fs.rm(dirPath, { recursive: true });
                
                console.log(`Deleted directory at: ${dirPath}`);
            } catch (error) {
                console.error('Error deleting directory:', error);
                socket.emit('terminal:error', { error: 'Failed to delete directory' });
            }
        });

        // Handle file content updates
        socket.on(SocketEvent.FILE_UPDATED, async ({ fileId, content, fileName }) => {
            try {
                const filePath = path.join(workspacePath, fileName);
                await fs.writeFile(filePath, content);
                
                console.log(`Updated file at: ${filePath}`);
            } catch (error) {
                console.error('Error updating file:', error);
                socket.emit('terminal:error', { error: 'Failed to update file' });
            }
        });

        socket.on('terminal:command', async ({ command, cwd }: TerminalCommand) => {
            console.log(`Executing command: ${command} with cwd: ${cwd}`);
            const [cmd, ...args] = command.trim().split(/\s+/);
        
            try {
                // Handle cd command
                if (cmd === 'cd') {
                    if (args[0] === "..") {
                        virtualDirectory = virtualDirectory.split("/").slice(0, -1).join("/") || "/";
                    } else {
                        virtualDirectory = path.join(virtualDirectory, args[0]).replace(/\\/g, '/');
                    }
                    socket.emit('terminal:output', { data: "" });
                    return;
                }
        
                // Handle pwd command
                if (cmd === 'pwd') {
                    socket.emit('terminal:output', { data: `${virtualDirectory}\r\n` });
                    return;
                }
        
                // Handle mkdir command
                if (cmd === 'mkdir' && args.length > 0) {
                    const dirName = args[0];
                    const newDirectory = {
                        id: uuidv4(),
                        name: dirName,
                        type: "directory",
                        children: [],
                        isOpen: true
                    };
                    
                    io.emit(SocketEvent.DIRECTORY_CREATED, {
                        parentDirId: "/",
                        newDirectory
                    });
                    
                    socket.emit('terminal:output', { 
                        data: `Directory created: ${dirName}\r\n`
                    });
                    return;
                }
        
                // Handle npm init command
                if (command.startsWith('npm init')) {
                    const projectName = command.split(' ')[2] || 'my-react-app';
                    currentProjectPath = path.join(workspacePath, projectName);
                    
                    try {
                        // Create project directory
                        await fs.mkdir(currentProjectPath, { recursive: true });
                        console.log('Creating project at:', currentProjectPath);

                        // Create project files in the project directory
                        for (const [filename, content] of Object.entries(reactTemplates)) {
                            const filePath = path.join(currentProjectPath, filename);
                            const dirPath = path.dirname(filePath);
                            
                            await fs.mkdir(dirPath, { recursive: true });
                            await fs.writeFile(
                                filePath, 
                                typeof content === 'object' ? JSON.stringify(content, null, 2) : content,
                                'utf-8'
                            );
                        }

                        // Emit virtual file structure update
                        io.emit(SocketEvent.FILE_STRUCTURE_UPDATE, {
                            type: 'project:created',
                            path: projectName,
                            parentPath: virtualDirectory,
                            rootId: uuidv4(),
                            templates: reactTemplates
                        });

                        socket.emit('terminal:output', { 
                            data: `Project created successfully at ${currentProjectPath}\n`
                        });
                        socket.emit('terminal:ready');

                    } catch (error) {
                        console.error('Error creating project:', error);
                        socket.emit('terminal:error', { error: 'Failed to create project' });
                    }
                    return;
                }
                if (command.startsWith('npm install')) {
                    // Get the exact project path from cwd
                    const projectName = cwd.split('/').filter(Boolean).pop();
                    const projectPath = path.join(workspacePath, projectName || '');
                    
                    console.log('Installing in project path:', projectPath);
                
                    try {
                        // Ensure directory exists
                        const stats = await fs.stat(projectPath);
                        if (!stats.isDirectory()) {
                            throw new Error(`Project directory ${projectPath} not found`);
                        }
                
                        // First try to delete existing node_modules if it exists
                        try {
                            await fs.rm(path.join(projectPath, 'node_modules'), { recursive: true, force: true });
                        } catch (e) {
                            // Ignore if directory doesn't exist
                        }
                
                        const npmProcess = spawn('npm', ['install', '--force', ...args.filter((arg: string) => arg !== 'install')], {
                            cwd: projectPath,
                            shell: true,
                            env: { 
                                ...Process.env, 
                                FORCE_COLOR: 'true',
                                NPM_CONFIG_PREFIX: projectPath,
                                NPM_CONFIG_GLOBAL: 'false',
                                // Force npm to use project directory
                                HOME: projectPath,
                                PWD: projectPath
                            }
                        });
                
                        npmProcess.stdout?.on('data', (data: Buffer) => {
                            const output = data.toString();
                            console.log('npm output:', output);
                            socket.emit('terminal:output', { data: output });
                        });
                
                        npmProcess.stderr?.on('data', (data: Buffer) => {
                            const output = data.toString();
                            console.log('npm error:', output);
                            socket.emit('terminal:output', { data: output });
                        });
                
                        npmProcess.on('close', async (code: number | null) => {
                            if (code === 0) {
                                // Get updated file list from the correct directory
                                const files = await fs.readdir(projectPath);
                                
                                io.emit(SocketEvent.FILE_STRUCTURE_UPDATE, {
                                    type: 'directory:updated',
                                    path: `/${projectName}`,
                                    children: files
                                });
                
                                socket.emit('terminal:output', { 
                                    data: '\nPackages installed successfully!\n' 
                                });
                            } else {
                                socket.emit('terminal:output', { 
                                    data: `\nInstallation failed with code ${code}\n` 
                                });
                            }
                            socket.emit('terminal:ready');
                        });
                
                    } catch (error) {
                        console.error('Error during installation:', error);
                        socket.emit('terminal:output', { 
                            data: `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n` 
                        });
                        socket.emit('terminal:ready');
                    }
                    return;
                }
                    
            
            
            
                if (command.startsWith('npm run dev')) {
                    const projectName = cwd.split('/').filter(Boolean).pop();
                    const absoluteProjectPath = path.resolve(workspacePath, projectName || '');
                    
                    try {
                        // Verify project exists
                        await fs.access(absoluteProjectPath);
                
                        // Create a Vite configuration that uses absolute paths
                        const viteConfig = `
                        import { defineConfig } from 'vite'
                        import react from '@vitejs/plugin-react'
                        import path from 'path'
                        
                        export default defineConfig({
                            plugins: [react()],
                            root: '${absoluteProjectPath.replace(/\\/g, '/')}',
                            publicDir: path.resolve('${absoluteProjectPath.replace(/\\/g, '/')}', 'public'),
                            server: {
                                host: '0.0.0.0',
                                port: 5174,
                                strictPort: true,
                                hmr: {
                                    clientPort: 5174
                                }
                            },
                            resolve: {
                                alias: {
                                    '@': path.resolve('${absoluteProjectPath.replace(/\\/g, '/')}', 'src')
                                }
                            },
                            optimizeDeps: {
                                force: true
                            },
                            cacheDir: path.resolve('${absoluteProjectPath.replace(/\\/g, '/')}', 'node_modules/.vite')
                        })`;
                
                        // Write the config
                        await fs.writeFile(
                            path.join(absoluteProjectPath, 'vite.config.ts'), 
                            viteConfig
                        );
                
                        // Use local installation of dependencies
                        const env = {
                            ...Process.env,
                            VITE_ROOT: absoluteProjectPath,
                            VITE_USER_NODE_ENV: 'development',
                            NODE_ENV: 'development',
                            VITE_CWD: absoluteProjectPath,
                            PWD: absoluteProjectPath,
                            HOME: absoluteProjectPath,
                            npm_config_prefix: absoluteProjectPath,
                            PATH: `${path.join(absoluteProjectPath, 'node_modules', '.bin')}${path.delimiter}${Process.env.PATH}`
                        };
                
                        // Execute vite directly from node_modules
                        const viteProcess = spawn(
                            'node', 
                            [
                                path.join(absoluteProjectPath, 'node_modules', 'vite', 'bin', 'vite.js'),
                                '--config', path.join(absoluteProjectPath, 'vite.config.ts'),
                                '--clearScreen=false'
                            ],
                            {
                                cwd: absoluteProjectPath,
                                env,
                                stdio: 'pipe',
                                shell: true
                            }
                        );
                
                        let serverStarted = false;
                
                        viteProcess.stdout?.on('data', (data: Buffer) => {
                            const output = data.toString();
                            console.log('Vite output:', output);
                            socket.emit('terminal:output', { data: output });
                
                            if (output.includes('Local:')) {
                                serverStarted = true;
                                const match = output.match(/http:\/\/localhost:\d+/);
                                if (match) {
                                    const url = match[0];
                                    socket.emit('terminal:output', { 
                                        data: `\nServer running at: ${url}\n` 
                                    });
                                }
                            }
                        });
                
                        viteProcess.stderr?.on('data', (data: Buffer) => {
                            const output = data.toString();
                            console.error('Vite error:', output);
                            socket.emit('terminal:output', { data: output });
                        });
                
                        viteProcess.on('close', (code: number | null) => {
                            if (!serverStarted) {
                                socket.emit('terminal:output', { 
                                    data: '\nServer failed to start. Check the configuration.\n' 
                                });
                            }
                            socket.emit('terminal:ready');
                        });
                
                        // Cleanup on disconnect
                        socket.on('disconnect', () => {
                            viteProcess.kill();
                        });
                
                    } catch (error) {
                        console.error('Error starting Vite:', error);
                        socket.emit('terminal:output', { 
                            data: `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n` 
                        });
                        socket.emit('terminal:ready');
                    }
                    return;
                }
                
    
        
                // Handle all other npm commands
                if (command.startsWith('npm')) {
                    const childProcess = spawn('npm', args, {
                        cwd: workspacePath,
                        shell: true,
                        env: { ...Process.env, FORCE_COLOR: 'true' }
                    });

                    childProcess.stdout?.on('data', (data: Buffer) => {
                        socket.emit('terminal:output', { data: data.toString() });
                    });

                    childProcess.stderr?.on('data', (data: Buffer) => {
                        socket.emit('terminal:output', { data: data.toString() });
                    });

                    childProcess.on('close', (code: number | null) => {
                        socket.emit('terminal:ready');
                    });
                    return;
                }

                // Handle all other commands
                const childProcess = spawn(cmd, args, {
                    cwd: workspacePath,
                    shell: true,
                    env: { ...Process.env, FORCE_COLOR: 'true' }
                });

                childProcess.stdout?.on('data', (data: Buffer) => {
                    socket.emit('terminal:output', { data: data.toString() });
                });

                childProcess.stderr?.on('data', (data: Buffer) => {
                    socket.emit('terminal:output', { data: data.toString() });
                });

                childProcess.on('close', (code: number | null) => {
                    socket.emit('terminal:ready');
                });

        
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                socket.emit('terminal:output', {
                    data: `Error: ${errorMessage}\r\n`
                });
                socket.emit('terminal:ready');
            }
        });

        socket.on('disconnect', () => {
            console.log('Terminal disconnected:', socket.id);
        });
    });
}