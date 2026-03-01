const { google } = require('googleapis');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 1. قراءة المفاتيح من متغيرات البيئة (GitHub Secrets)
const googleKey = JSON.parse(process.env.GOOGLE_KEY);
const firebaseKey = JSON.parse(process.env.FIREBASE_KEY);

// 2. إعداد Firebase
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(firebaseKey)
    });
}
const db = admin.firestore();

// 3. إعداد Google Indexing
const jwtClient = new google.auth.JWT(
    googleKey.client_email,
    null,
    googleKey.private_key,
    ['https://www.googleapis.com/auth/indexing']
);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function startProcess() {
    try {
        console.log("🔍 جاري جلب الألعاب من Firebase...");
        // تأكد من صحة مسار الـ Collection الخاص بك
        const snapshot = await db.collection('artifacts').doc('gaming-hub-pro')
                                 .collection('public').doc('data')
                                 .collection('games').get();

        if (snapshot.empty) {
            console.log("⚠️ لم يتم العثور على ألعاب.");
            return;
        }

        // --- الجزء الأول: توليد الـ Sitemap ---
        console.log("🏗️ جاري بناء الـ Sitemap...");
        const baseUrl = 'https://funclickergame.com';
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
        xml += `  <url><loc>${baseUrl}/</loc><priority>1.0</priority></url>\n`;

        snapshot.docs.forEach(doc => {
            const game = doc.data();
            xml += `  <url><loc>${baseUrl}/game/${game.slug}</loc><priority>0.8</priority></url>\n`;
        });
        xml += `</urlset>`;

        // إنشاء مجلد public إذا لم يكن موجوداً (حل خطأ ENOENT)
        const publicDir = path.join(process.cwd(), 'public');
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir);
        }
        fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), xml);
        console.log("✅ تم تحديث sitemap.xml بنجاح.");

        // --- الجزء الثاني: تشغيل المطرقة (Indexing) ---
        const tokens = await jwtClient.authorize();
        console.log("🔨 بدأت المطرقة (إرسال الروابط لجوجل)...");

        const games = snapshot.docs;
        const batchSize = 5; // نرسل 5 روابط كل مرة لتجنب خطأ 429

        for (let i = 0; i < games.length; i += batchSize) {
            const batch = games.slice(i, i + batchSize);
            
            const requests = batch.map(doc => {
                const game = doc.data();
                const url = `${baseUrl}/game/${game.slug}`;
                return google.indexing('v3').urlNotifications.publish({
                    auth: jwtClient,
                    requestBody: { url: url, type: 'URL_UPDATED' }
                });
            });

            await Promise.all(requests);
            console.log(`✅ تم إرسال دفعة من ${batch.length} روابط.`);

            if (i + batchSize < games.length) {
                console.log("⏳ انتظار 5 ثوانٍ لتجنب الحظر (429)...");
                await sleep(5000);
            }
        }

        console.log("🏁 انتهت العملية بالكامل!");
    } catch (error) {
        console.error("❌ خطأ:", error.message);
        process.exit(1);
    }
}

startProcess();
