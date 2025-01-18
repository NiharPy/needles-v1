import multer from 'multer';
import path from 'path';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/voiceNotes/'); // Adjust this path as needed
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname)); // Save file with unique name
    },
  });
  
  const upload = multer({ storage });

  export{upload};
