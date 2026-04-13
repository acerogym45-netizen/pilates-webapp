/**
 * 파일 업로드 API
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const UPLOAD_DIR = process.env.UPLOAD_DIR || './public/uploads';
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, unique + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) {
        cb(null, true);
    } else {
        cb(new Error('이미지 파일만 업로드 가능합니다 (jpg, png, gif, webp)'));
    }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB 제한

router.post('/image', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: '파일이 없습니다' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ success: true, url, filename: req.file.filename });
});

router.delete('/image/:filename', (req, res) => {
    const filePath = path.join(UPLOAD_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return res.json({ success: true });
    }
    res.status(404).json({ success: false, error: '파일을 찾을 수 없습니다' });
});

module.exports = router;
