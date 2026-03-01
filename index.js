const { google } = require('googleapis');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 1. جلب المفاتيح من GitHub Secrets
const googleKey = JSON.parse(process.env.GOOGLE_KEY);
const firebaseKey = JSON.parse(process.env.FIREBASE_KEY);

// 2. تهيئة Firebase
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(firebaseKey)
    });
}
const db = admin.firestore();

// 3. تهيئة Google Indexing
const jwtClient = new google.auth.JWT(
    googleKey.client_email,
    null,
    googleKey.private_key,
    ['https://www.googleapis.com/auth/indexing']
);

async function startHammer() {
    try {
        console.log("📡 جاري الاتصال بقاعدة البيانات...");
        
        // المسار الدقيق للألعاب في Firestore
        const snapshot = await db.collection('artifacts').doc('gaming-hub-pro')
                                 .collection('public').doc('data')
                                 .collection('games').get();

        if (snapshot.empty) {
            console.log("⚠️ لا توجد ألعاب لإرسالها.");
            return;
        }

        const baseUrl = 'https://funclickergame.com';
        
        // --- أولاً: توليد ملف الـ Sitemap (حل مشكلة الـ HTML) ---
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
        xml += `  <url><loc>${baseUrl}/</loc><priority>1.0</priority></url>\n`;

        snapshot.docs.forEach(doc => {
            const game = doc.data();
            xml += `  <url><loc>${baseUrl}/game/${game.slug}</loc><priority>0.8</priority></url>\n`;
        });
        xml += `</urlset>`;

        // إنشاء مجلد public إذا لم يكن موجوداً (حل خطأ ENOENT)
        const publicDir = path.join(process.cwd(), 'public');
        if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
        
        fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), xml);
        console.log("✅ تم إنشاء sitemap.xml بنجاح.");

        // --- ثانياً: تشغيل المطرقة (Indexing) مع حل خطأ 429 ---
        const tokens = await jwtClient.authorize();
        console.log("🔨 بدأت المطرقة في إرسال الروابط لجوجل...");

        for (const doc of snapshot.docs) {
            const game = doc.data();
            const url = `${baseUrl}/game/${game.slug}`;

            try {
                await google.indexing('v3').urlNotifications.publish({
                    auth: jwtClient,
                    requestBody: { url: url, type: 'URL_UPDATED' }
                });
                console.log(`🚀 تم إرسال: ${url}`);
            } catch (err) {
                console.error(`❌ فشل إرسال ${url}:`, err.message);
            }

            // تأخير 2 ثانية بين كل رابط (هذا يحل مشكلة الـ 429 نهائياً)
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log("🏁 انتهت العملية بنجاح!");
    } catch (error) {
        console.error("❌ خطأ فادح:", error.message);
        process.exit(1);
    }
}

startHammer();
