// src/socket/terminalSocket.ts
import { Server, Socket } from 'socket.io';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import * as fs from 'fs/promises';
import * as net from 'net';
import { v4 as uuidv4 } from 'uuid';
import * as Process from 'process';
import { SocketEvent } from '../types/socket';
import * as os from 'os';
import { platform } from 'os';



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
const flutterTemplates = {
    'pubspec.yaml': `
name: flutter_app
description: A new Flutter project.
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  cupertino_icons: ^1.0.2

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^2.0.0

flutter:
  uses-material-design: true`,
    '.gitignore': `
# Flutter/Dart specific
**/doc/api/
**/ios/Flutter/.last_build_id
.dart_tool/
.flutter-plugins
.flutter-plugins-dependencies
.packages
.pub-cache/
.pub/
/build/
*.iml
*.ipr
*.iws
.idea/
.vscode/`
};

interface ProcessCache {
    [key: string]: ChildProcess;
}

interface TerminalCommand {
    command: string;
    cwd: string;
}
async function readProjectDirectory(directoryPath: string): Promise<any[]> {
    const children: any[] = [];
    const blackList = ['.git', '.vscode', '.dart_tool', 'build', '.idea'];

    try {
        const entries = await fs.readdir(directoryPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(directoryPath, entry.name);

            if (entry.isFile()) {
                try {
                    const content = await fs.readFile(fullPath, 'utf-8');
                    children.push({
                        id: uuidv4(),
                        name: entry.name,
                        type: 'file',
                        content: content,
                    });
                } catch (error) {
                    console.error(`Error reading file ${fullPath}:`, error);
                }
            } else if (entry.isDirectory() && !blackList.includes(entry.name)) {
                children.push({
                    id: uuidv4(),
                    name: entry.name,
                    type: 'directory',
                    children: await readProjectDirectory(fullPath),
                    isOpen: false,
                });
            }
        }
    } catch (error) {
        console.error(`Error reading directory ${directoryPath}:`, error);
    }

    return children;
}

export function setupTerminalSocket(io: Server) {
    // Add at the start of setupTerminalSocket
    function getViteProjectPath(workspacePath: string, projectName: string) {
        return path.join(workspacePath, projectName);
    }
    const processCache: ProcessCache = {};
    const cleanupProcess = (projectPath: string) => {
        const process = processCache[projectPath];
        if (process) {

            try {
                if (platform() === 'win32') {
                    spawn('taskkill', ['/pid', process.pid!.toString(), '/f', '/t']);
                } else {
                    process.kill('SIGINT');
                }
                delete processCache[projectPath];
            } catch (err) {
                console.error('Error killing process:', err);
            }
        }
    };
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
        socket.on('terminal:signal', ({ signal, projectPath }) => {
            console.log('Received signal:', signal, 'for project:', projectPath);
            if (signal === 'SIGINT') {
                cleanupProcess(projectPath);
                socket.emit('terminal:output', { data: '\nProcess terminated.\n' });
                socket.emit('terminal:ready');
            }
        });

        socket.on('terminal:command', async ({ command, cwd }: TerminalCommand) => {
            console.log(`Executing command: ${command} with cwd: ${cwd}`);
            const [cmd, ...args] = command.trim().split(/\s+/);

            try {
                // Handle cd command
                // Handle cd command
                if (cmd === 'cd') {
                    try {
                        if (args[0] === "..") {
                            // Reset to root on cd ..
                            virtualDirectory = "/";
                        } else {
                            const targetDir = args[0];
                            const newPath = path.join(workspacePath, targetDir);

                            try {
                                const stats = await fs.stat(newPath);
                                if (stats.isDirectory()) {
                                    virtualDirectory = `/${targetDir}`;
                                } else {
                                    socket.emit('terminal:error', { error: `${targetDir} is not a directory` });
                                    virtualDirectory = "/";
                                    return;
                                }
                            } catch (error) {
                                socket.emit('terminal:error', { error: `No such directory: ${targetDir}` });
                                virtualDirectory = "/";
                                return;
                            }
                        }

                        socket.emit('terminal:output', { data: "" });
                        console.log('Changed directory to:', virtualDirectory);
                    } catch (error) {
                        console.error('Error changing directory:', error);
                        socket.emit('terminal:error', { error: 'Failed to change directory' });
                        virtualDirectory = "/";
                    }
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
                if (command.startsWith('flutter create')) {
                    const projectName = args[1] || 'flutter_app';
                    currentProjectPath = path.resolve(workspacePath, projectName);
                    console.log('Creating Flutter project at:', currentProjectPath);

                    try {
                        // Create Flutter project using flutter create command
                        const createProcess = spawn('flutter', ['create', projectName], {
                            cwd: workspacePath,
                            shell: true,
                            env: { ...Process.env, FORCE_COLOR: 'true' }
                        });

                        createProcess.stdout?.on('data', (data: Buffer) => {
                            socket.emit('terminal:output', { data: data.toString() });
                        });

                        createProcess.stderr?.on('data', (data: Buffer) => {
                            socket.emit('terminal:output', { data: data.toString() });
                        });

                        createProcess.on('close', async (code: number | null) => {
                            if (code === 0) {
                                try {
                                    // Read the actual project directory structure
                                    const projectStructure = await readProjectDirectory(currentProjectPath);

                                    // Emit the actual file structure to update the frontend
                                    io.emit(SocketEvent.FILE_STRUCTURE_UPDATE, {
                                        type: 'project:created',
                                        path: projectName,
                                        parentPath: virtualDirectory,
                                        rootId: uuidv4(),
                                        structure: projectStructure  // Send the actual structure
                                    });

                                    socket.emit('terminal:output', {
                                        data: `\nFlutter project created and imported successfully at ${currentProjectPath}\n`
                                    });
                                } catch (error) {
                                    console.error('Error reading project structure:', error);
                                    socket.emit('terminal:error', {
                                        error: 'Project created but failed to import structure'
                                    });
                                }
                            } else {
                                socket.emit('terminal:output', {
                                    data: `\nProject creation failed with code ${code}\n`
                                });
                            }
                            socket.emit('terminal:ready');
                        });
                    } catch (error) {
                        console.error('Error creating Flutter project:', error);
                        socket.emit('terminal:error', { error: 'Failed to create Flutter project' });
                        socket.emit('terminal:ready');
                    }
                    return;
                }
                if (command.startsWith('flutter run')) {
                    const projectName = cwd.split('/').filter(Boolean).pop();
                    const projectPath = path.join(workspacePath, projectName || '');

                    try {
                        // Verify pubspec.yaml exists and is readable
                        const pubspecPath = path.join(projectPath, 'pubspec.yaml');
                        await fs.access(pubspecPath);

                        // Run flutter pub get first
                        const pubGetProcess = spawn('flutter', ['pub', 'get'], {
                            cwd: projectPath,
                            shell: true,
                            env: { ...Process.env, FORCE_COLOR: 'true' }
                        });

                        pubGetProcess.stdout?.on('data', (data: Buffer) => {
                            socket.emit('terminal:output', { data: data.toString() });
                        });

                        pubGetProcess.stderr?.on('data', (data: Buffer) => {
                            socket.emit('terminal:output', { data: data.toString() });
                        });

                        pubGetProcess.on('close', (code: number | null) => {
                            if (code === 0) {
                                // Now run the actual flutter run command
                                const runProcess = spawn('flutter', ['run', ...args.slice(1)], {
                                    cwd: projectPath,
                                    shell: true,
                                    env: {
                                        ...Process.env,
                                        FORCE_COLOR: 'true',
                                        PWD: projectPath,
                                        FLUTTER_ROOT: Process.env.FLUTTER_ROOT
                                    }
                                });

                                runProcess.stdout?.on('data', (data: Buffer) => {
                                    socket.emit('terminal:output', { data: data.toString() });
                                });

                                runProcess.stderr?.on('data', (data: Buffer) => {
                                    socket.emit('terminal:output', { data: data.toString() });
                                });

                                runProcess.on('close', (code: number | null) => {
                                    socket.emit('terminal:ready');
                                });

                                // Cleanup on disconnect
                                socket.on('disconnect', () => {
                                    runProcess.kill();
                                });
                            } else {
                                socket.emit('terminal:output', {
                                    data: `\nFlutter pub get failed with code ${code}\n`
                                });
                                socket.emit('terminal:ready');
                            }
                        });
                        return;
                    } catch (error) {
                        console.error('Error running Flutter project:', error);
                        socket.emit('terminal:output', {
                            data: `Error: Could not find pubspec.yaml in ${projectPath}. Please ensure you're in a Flutter project directory.\n`
                        });
                        socket.emit('terminal:ready');
                        return;
                    }
                }

                // Handle npm init command
                if (command.startsWith('npm init')) {
                    const projectName = command.split(' ')[2] || 'my-react-app';
                    currentProjectPath = path.join(workspacePath, projectName);

                    const cleanup = () => {
                        socket.emit('terminal:ready');
                    };

                    try {
                        await fs.mkdir(currentProjectPath, { recursive: true });
                        console.log('Creating project at:', currentProjectPath);

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
                        cleanup();

                    } catch (error) {
                        console.error('Error creating project:', error);
                        socket.emit('terminal:error', { error: 'Failed to create project' });
                        cleanup();
                    }
                    return;
                }
                if (command.startsWith('npm install')) {
                    const projectName = cwd.split('/').filter(Boolean).pop();
                    const projectPath = path.join(workspacePath, projectName || '');

                    const cleanup = () => {
                        socket.emit('terminal:ready');
                    };

                    console.log('Installing in project path:', projectPath);

                    try {
                        const stats = await fs.stat(projectPath);
                        if (!stats.isDirectory()) {
                            throw new Error(`Project directory ${projectPath} not found`);
                        }

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
                                HOME: projectPath,
                                PWD: projectPath
                            }
                        });

                        if (npmProcess && npmProcess.pid) {
                            processCache[projectPath] = npmProcess;
                        }

                        npmProcess.stdout?.on('data', (data: Buffer) => {
                            const output = data.toString();
                            socket.emit('terminal:output', { data: output });
                        });

                        npmProcess.stderr?.on('data', (data: Buffer) => {
                            const output = data.toString();
                            socket.emit('terminal:output', { data: output });
                        });

                        npmProcess.on('close', async (code: number | null) => {
                            delete processCache[projectPath];
                            if (code === 0) {
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
                            // Delay the ready signal slightly
                            setTimeout(cleanup, 100);
                        });

                        npmProcess.on('error', (error) => {
                            console.error('Process error:', error);
                            socket.emit('terminal:output', { data: `Error: ${error.message}\n` });
                            cleanup();
                        });

                    } catch (error) {
                        console.error('Error during installation:', error);
                        socket.emit('terminal:output', {
                            data: `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`
                        });
                        cleanup();
                    }
                    return;
                }




                if (command.startsWith('npm run dev')) {
                    const projectName = cwd.split('/').filter(Boolean).pop();
                    const absoluteProjectPath = path.resolve(workspacePath, projectName || '');

                    const cleanup = () => {
                        socket.emit('terminal:ready');
                    };
                    try {
                        // Function to find available port
                        const findAvailablePort = async (startPort: number): Promise<number> => {
                            const net = require('net');
                            const maxPort = startPort + 20; // Try up to 20 ports after the start port

                            const tryPort = (port: number): Promise<number> => {
                                return new Promise((resolve, reject) => {
                                    if (port > maxPort) {
                                        reject(new Error('No available ports found'));
                                        return;
                                    }

                                    const server = net.createServer();
                                    server.unref();

                                    server.on('error', () => {
                                        // Try next port
                                        tryPort(port + 1).then(resolve, reject);
                                    });

                                    server.listen(port, () => {
                                        server.close(() => resolve(port));
                                    });
                                });
                            };

                            try {
                                return await tryPort(startPort);
                            } catch (err) {
                                console.error('Port finding error:', err);
                                // If all else fails, let Vite find a port
                                return 0;
                            }
                        };

                        // Get available port
                        const port = await findAvailablePort(5174);
                        console.log('Found available port:', port);

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
                                port: ${port},
                                strictPort: false, // Changed to false to allow fallback
                                hmr: {
                                    clientPort: ${port}
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


                        let viteProcess: ChildProcess | null = null;
                        let processCache: { [key: string]: ChildProcess } = {};

                        // Kill any existing Vite process
                        const currentProcess = processCache[absoluteProjectPath];
                        if (currentProcess) {
                            try {
                                currentProcess.kill();
                                delete processCache[absoluteProjectPath];
                            } catch (err) {
                                console.error('Error killing process:', err);
                            }
                        }
                        cleanupProcess(absoluteProjectPath);

                        // Execute vite directly from node_modules
                        viteProcess = spawn(
                            'node',
                            [
                                path.join(absoluteProjectPath, 'node_modules', 'vite', 'bin', 'vite.js'),
                                '--config', path.join(absoluteProjectPath, 'vite.config.ts'),
                                '--clearScreen=false',
                                port ? ['--port', port.toString()] : []
                            ].flat(),
                            {
                                cwd: absoluteProjectPath,
                                env,
                                stdio: 'pipe',
                                shell: true,
                                detached: false
                            }
                        );

                        if (viteProcess && viteProcess.pid) {
                            processCache[absoluteProjectPath] = viteProcess;
                        }

                        let serverStarted = false;


                        viteProcess.stdout?.on('data', (data: Buffer) => {
                            const output = data.toString();
                            socket.emit('terminal:output', { data: output });

                            if (output.includes('Local:') && !serverStarted) {
                                serverStarted = true;
                                const match = output.match(/http:\/\/localhost:\d+/);
                                if (match) {
                                    const url = match[0];
                                    socket.emit('terminal:output', {
                                        data: `\nServer running at: ${url}\n`
                                    });
                                }
                                // Delay the ready signal slightly
                                setTimeout(cleanup, 100);
                            }
                        });

                        viteProcess.stderr?.on('data', (data: Buffer) => {
                            const output = data.toString();
                            socket.emit('terminal:output', { data: output });
                        });

                        viteProcess.on('close', (code: number | null) => {
                            delete processCache[absoluteProjectPath];
                            if (!serverStarted) {
                                socket.emit('terminal:output', {
                                    data: '\nServer failed to start. Check the configuration.\n'
                                });
                                cleanup();
                            }
                        });

                        viteProcess.on('error', (error) => {
                            console.error('Process error:', error);
                            socket.emit('terminal:output', { data: `Error: ${error.message}\n` });
                            cleanup();
                        });





                    } catch (error) {
                        console.error('Error starting Vite:', error);
                        socket.emit('terminal:output', {
                            data: `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`
                        });
                        cleanup();
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