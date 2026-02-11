const express = require('express');
const path = require('path');
const app = express();

// استخدام المنفذ الذي تحدده Render أو 3000 كاحتياطي
const port = process.env.PORT || 3000;

// إخبار السيرفر بقراءة الملفات من المجلد الرئيسي
app.use(express.static(__dirname));

// المسار الرئيسي لتشغيل تطبيقك
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'), (err) => {
    if (err) {
      // إذا لم يجد الملف في المجلد الرئيسي، سيحاول البحث عنه في مجلد src (لحل مشكلة الصورة 42)
      res.sendFile(path.join(__dirname, 'src', 'index.html'), (err2) => {
        if (err2) {
          res.status(404).send("الملف index.html غير موجود في المجلد الرئيسي أو مجلد src. تأكد من رفعه على GitHub.");
        }
      });
    }
  });
});

// تشغيل السيرفر
app.listen(port, () => {
  console.log(`Server is live on port ${port}`);
});
