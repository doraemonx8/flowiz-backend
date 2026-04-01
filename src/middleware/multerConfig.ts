import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { Request } from 'express';

const uploadDirectory = path.join(__dirname, '../../attachment');

const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    const folderName = req.query.from as string;

    if (!folderName) {
      return cb(new Error('Folder name is required'), '');
    }

    const destinationFolder = path.join(uploadDirectory, folderName);

    // Ensure directory exists synchronously so it doesn't fail
    if (!fs.existsSync(destinationFolder)) {
      fs.mkdirSync(destinationFolder, { recursive: true });
    }

    cb(null, destinationFolder);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const randomName = Array(32)
      .fill(null)
      .map(() => Math.round(Math.random() * 16).toString(16))
      .join('');
    return cb(null, `${randomName}${path.extname(file.originalname)}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 5, // 5 MB file size limit
  },
});