
// In your backend API route (e.g., api/room/saveRoom.ts)
import { Router } from 'express';
import Room from '../models/Room'; // You'll need to create this model

const router = Router();

router.post('/saveRoom', async (req, res) => {
  try {
    const { username, roomId } = req.body;
    
    // Check if room already exists
    let room = await Room.findOne({ roomId });
    
    if (room) {
      // If room exists, add user to participants if not already present
      if (!room.participants.includes(username)) {
        room.participants.push(username);
        await room.save();
      }
    } else {
      // Create new room with first participant
      room = new Room({
        roomId,
        participants: [username],
        createdAt: new Date()
      });
      await room.save();
    }

    res.status(200).json({ success: true, room });
  } catch (error) {
    console.error('Error saving room:', error);
    res.status(500).json({ success: false, error: 'Failed to save room data' });
  }
});
// In your backend routes
router.get('/user-rooms/:username', async (req, res) => {
    try {
      const { username } = req.params;
      const rooms = await Room.find({ 
        participants: username 
      }).sort({ createdAt: -1 });
      
      res.status(200).json({ 
        success: true, 
        rooms 
      });
    } catch (error) {
      console.error('Error fetching user rooms:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch rooms' 
      });
    }
  });
export default router;