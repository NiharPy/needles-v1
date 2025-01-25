import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinaryModule from 'cloudinary';

const cloudinary = cloudinaryModule.v2;

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage configuration for both image and audio
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let folder = 'uploads'; // Default folder for images
    if (file.mimetype.startsWith('audio/')) {
      folder = 'audio_files'; // Folder for audio files
    }

    return {
      folder: folder,
      resource_type: file.mimetype.startsWith('audio/') ? 'auto' : 'image',
      public_id: `${Date.now()}-${file.originalname.split('.')[0]}`, // Unique file name
    };
  },
});

// Configure Multer for handling both image and audio files
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Limit file size to 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio and image files are allowed!'), false);
    }
  },
});

export { upload };


