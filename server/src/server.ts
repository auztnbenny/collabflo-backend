//server.ts
import express, { Response, Request } from "express";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import mongoose from "mongoose";
import path from "path";
import { SocketEvent, SocketId } from "./types/socket";
import { USER_CONNECTION_STATUS, User } from "./types/user";
import { Server } from "socket.io";
import { GoogleGenerativeAI } from "@google/generative-ai";
import aiRoutes from './routes/ai';
import lintRoutes from './routes/lint';
import { exec } from "child_process";
import userRoutes from "./routes/userRoutes";
import roomRoutes from "./routes/roomRoutes";
import { Message } from './models/Message';
import { setupTerminalSocket } from './socket/terminalsocket';


dotenv.config();

const app = express();

const corsOptions = {
  origin: process.env.FRONTEND_URL,
  credentials: true,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' })); // Increased limit for file uploads
app.use(express.static(path.join(__dirname, "public")));
app.use((err: Error, req: Request, res: Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  console.error('Stack trace:', err.stack);
  console.error('Request path:', req.path);
  console.error('Request method:', req.method);
  console.error('Request body:', req.body);
  
  res.status(500).json({
    message: 'An unexpected error occurred',
    error: err.message,
  });
});

// MongoDB Connection
const mongoUri: string | undefined = process.env.MONGO_URI;

if (!mongoUri) {
  throw new Error('MONGO_URI is not defined in the environment variables');
}

mongoose.connect(mongoUri, {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
} as mongoose.ConnectOptions)
.then(() => {
  console.log('MongoDB connected');
  // Log the connection details
  console.log('Connection state:', mongoose.connection.readyState);
  console.log('Database name:', mongoose.connection.name);
})
.catch((err) => {
  console.error('MongoDB connection error:', err);
  console.error('Full error details:', JSON.stringify(err, null, 2));
});

// Your existing routes and middleware
app.use('/api/lint', lintRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/user', userRoutes);
app.use('/api/room', roomRoutes);
app.use(express.static(path.join(__dirname, "public")));

// Global error handler
app.use((err: Error, req: Request, res: Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  console.error('Stack trace:', err.stack);
  console.error('Request path:', req.path);
  console.error('Request method:', req.method);
  console.error('Request body:', req.body);
  
  res.status(500).json({
    message: 'An unexpected error occurred',
    error: err.message,
  });
});



// Initialize the Google AI client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
console.log("Gemini API Key:", process.env.GOOGLE_API_KEY ? "Set" : "Not set");

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
});
setupTerminalSocket(io);

let userSocketMap: User[] = [];

// Socket functions
function getUsersInRoom(roomId: string): User[] {
  return userSocketMap.filter((user) => user.roomId == roomId);
}

function getRoomId(socketId: SocketId): string | null {
  const roomId = userSocketMap.find((user) => user.socketId === socketId)?.roomId;
  return roomId || null;
}

function getUserBySocketId(socketId: SocketId): User | null {
  return userSocketMap.find((user) => user.socketId === socketId) || null;
}

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  socket.on(SocketEvent.JOIN_REQUEST, ({ roomId, username }) => {
    console.log(`Debug: User join request for room ${roomId} with username ${username}`);
    
    const isUsernameExist = getUsersInRoom(roomId).some((u) => u.username === username);
    if (isUsernameExist) {
      console.log(`Debug: Username ${username} already exists in room ${roomId}`);
      io.to(socket.id).emit(SocketEvent.USERNAME_EXISTS);
      return;
    }

    const user: User = {
      username,
      roomId,
      status: USER_CONNECTION_STATUS.ONLINE,
      cursorPosition: 0,
      typing: false,
      socketId: socket.id,
      currentFile: null,
      currentDir: (currentDir: any, targetDir: any) => {
        return 'Changed directory from ${currentDir} to ${targetDir}';
      },
    };

    userSocketMap.push(user);
    socket.join(roomId);
    socket.broadcast.to(roomId).emit(SocketEvent.USER_JOINED, { user });
    const users = getUsersInRoom(roomId);
    io.to(socket.id).emit(SocketEvent.JOIN_ACCEPTED, { user, users });
    socket.emit(SocketEvent.ROOM_JOINED);
  });

   
  // File system events
  socket.on(SocketEvent.FILE_STRUCTURE_UPDATE, (data) => {
    console.log("Received file structure update:", data);
    // Broadcast to all connected clients
    io.emit(SocketEvent.FILE_STRUCTURE_UPDATE, data);
});
  socket.on(SocketEvent.DIRECTORY_CREATED, ({ parentDirId, newDirectory }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_CREATED, {
      parentDirId,
      newDirectory,
    });
  });

  socket.on(SocketEvent.DIRECTORY_UPDATED, ({ dirId, children }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_UPDATED, {
      dirId,
      children,
    });
  });

  socket.on(SocketEvent.DIRECTORY_RENAMED, ({ dirId, newName }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_RENAMED, {
      dirId,
      newName,
    });
  });

  socket.on(SocketEvent.DIRECTORY_DELETED, ({ dirId }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_DELETED, { dirId });
  });

  socket.on(SocketEvent.FILE_CREATED, ({ parentDirId, newFile }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_CREATED, { parentDirId, newFile });
  });

  socket.on(SocketEvent.FILE_UPDATED, ({ fileId, newContent }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_UPDATED, {
      fileId,
      newContent,
    });
  });

  socket.on(SocketEvent.FILE_RENAMED, ({ fileId, newName }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_RENAMED, {
      fileId,
      newName,
    });
  });

  socket.on(SocketEvent.FILE_DELETED, ({ fileId }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_DELETED, { fileId });
  });

  // User status events
  socket.on(SocketEvent.USER_OFFLINE, ({ socketId }) => {
    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socketId) {
        return { ...user, status: USER_CONNECTION_STATUS.OFFLINE };
      }
      return user;
    });
    const roomId = getRoomId(socketId);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.USER_OFFLINE, { socketId });
  });

  socket.on(SocketEvent.USER_ONLINE, ({ socketId }) => {
    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socketId) {
        return { ...user, status: USER_CONNECTION_STATUS.ONLINE };
      }
      return user;
    });
    const roomId = getRoomId(socketId);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.USER_ONLINE, { socketId });
  });

  // Chat and messaging events
  socket.on(SocketEvent.SEND_MESSAGE, ({ message }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.RECEIVE_MESSAGE, { message });
  });

  // Typing and cursor events
  socket.on(SocketEvent.TYPING_START, ({ cursorPosition }) => {
    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socket.id) {
        return { ...user, typing: true, cursorPosition };
      }
      return user;
    });
    const user = getUserBySocketId(socket.id);
    if (!user) return;
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.TYPING_START, { user });
  });

  socket.on(SocketEvent.TYPING_PAUSE, () => {
    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socket.id) {
        return { ...user, typing: false };
      }
      return user;
    });
    const user = getUserBySocketId(socket.id);
    if (!user) return;
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.TYPING_PAUSE, { user });
  });

  // Drawing events
  socket.on(SocketEvent.REQUEST_DRAWING, () => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.REQUEST_DRAWING, { socketId: socket.id });
  });

  socket.on(SocketEvent.SYNC_DRAWING, ({ drawingData, socketId }) => {
    socket.broadcast.to(socketId).emit(SocketEvent.SYNC_DRAWING, { drawingData });
  });

  socket.on(SocketEvent.DRAWING_UPDATE, ({ snapshot }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.DRAWING_UPDATE, { snapshot });
  });

  // Existing events from first file
  socket.on("disconnecting", () => {
    const user = getUserBySocketId(socket.id);
    if (!user) return;
    socket.broadcast.to(user.roomId).emit(SocketEvent.USER_DISCONNECTED, { user });
    userSocketMap = userSocketMap.filter((u) => u.socketId !== socket.id);
    socket.leave(user.roomId);

    console.log('Debug: User ${user.username} disconnected from room ${user.roomId}');

    try {
      console.log("Debug: User data removed from DB successfully!");
    } catch (error) {
      console.error("\u2717 Error removing user data from DB:", error);
    }
  });

  socket.on(SocketEvent.SYNC_FILE_STRUCTURE, ({ fileStructure, openFiles, activeFile, socketId }) => {
    console.log("Debug: Syncing file structure to socket ID", socketId);
    io.to(socketId).emit(SocketEvent.SYNC_FILE_STRUCTURE, { fileStructure, openFiles, activeFile });
  });

  socket.on(SocketEvent.CHATBOT_MESSAGE, async (message) => {
    console.log("Debug: Received message for chatbot:", message);

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      const prompt = 'You are a helpful assistant that generates code based on user requests. Always wrap your code in triple backticks. User request: ${message}';
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const generatedContent = response.text();
      socket.emit(SocketEvent.CHATBOT_RESPONSE, generatedContent);
    } catch (error) {
      console.error("\u2717 Error processing chatbot message:", error);
      socket.emit(SocketEvent.CHATBOT_ERROR, "An error occurred while processing your request.");
    }
  });

  socket.on("message", (message) => {
    const isTerminalCommand = message.startsWith("terminal:");
    if (isTerminalCommand) {
      const command = message.slice(9).trim();
      const allowedCommands = ["ls", "pwd", "cat", "echo", "clear"];
      const commandName = command.split(" ")[0];
      console.log('Debug: Terminal command received: ${commandName}');
      if (!allowedCommands.includes(commandName)) {
        socket.emit("terminalOutput", 'Error: Command "${commandName}" is not allowed.');
        return;
      }
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error("\u2717 Error executing terminal command:", error);
          socket.emit("terminalOutput", 'Error executing command: ${stderr}');
          return;
        }
        console.log("Debug: Terminal command output:", stdout);
        socket.emit("terminalOutput", stdout);
      });
    } else {
      socket.emit(SocketEvent.CHATBOT_MESSAGE, message);
    }
  });

  socket.on("error", (err) => {
    console.error("Socket error:", err);
  });

  // Add new chat message handling with MongoDB support
  socket.on("chat_message", async (data) => {
    const { message, roomId, attachments } = data;
    
    // Broadcast the message to the room
    io.to(roomId).emit("message_received", {
        sender: socket.id,
        content: message,
        attachments,
        timestamp: new Date()
    });

    // Save to MongoDB
    try {
        const newMessage = new Message({
            sender: socket.id,
            content: message,
            attachments,
            timestamp: new Date(),
            roomId
        });
        await newMessage.save();
    } catch (error) {
        console.error('Error saving message:', error);
    }
  });

  // Add typing indicators
  socket.on("typing", (data) => {
    const { roomId, username } = data;
    socket.broadcast.to(roomId).emit("user_typing", { username });
  });

  socket.on("stop_typing", (data) => {
    const { roomId, username } = data;
    socket.broadcast.to(roomId).emit("user_stopped_typing", { username });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});