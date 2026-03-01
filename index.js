const { google } = require('googleapis');
const admin = require('firebase-admin');
const fs = require('fs');

// 1. قراءة المفاتيح (تأكد من إضافتها في GitHub Secrets بنفس الأسماء)
const googleKey = JSON.parse(process.env.GOOGLE_KEY);
const firebaseKey = JSON.parse(process.env.FIREBASE_KEY);

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(firebaseKey) });
}
const db = admin.firestore();

const jwtClient = new google.auth.JWT(
    googleKey.client_email, null, googleKey.private_key,
    ['https://www.googleapis.com/auth/indexing']
);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function startProcess() {
    try {
        console.log("🔍 جاري جلب البيانات من Firebase...");
        const snapshot = await db.collection('artifacts').doc('gaming-hub-pro')
                                 .collection('public').doc('data')
                                 .collection('games').get();

        if (snapshot.empty) {
            console.log("⚠️ لا توجد ألعاب لإرسالها.");
            return;
        }

        // --- الجزء الأول: توليد الـ Sitemap ---
       
        // --- الجزء الثاني: تشغيل المطرقة (Indexing) ---
        const tokens = await jwtClient.authorize();
        console.log("🔨 بدأت المطرقة في العمل (نظام المجموعات)...");

        const games = snapshot.docs;
        const batchSize = 5; // نرسل 5 فقط ثم ننتظر لتجنب الـ 429

        for (let i = 0; i < games.length; i += batchSize) {
            const batch = games.slice(i, i + batchSize);
            
            const requests = batch.map(doc => {
                const game = doc.data();
                const url = `${baseUrl}/game/${game.slug}`;
                // نصيحة سليم: لا تبالغ في الـ fakeGclid، جوجل يفضل الروابط النظيفة
                return google.indexing('v3').urlNotifications.publish({
                    auth: jwtClient,
                    requestBody: { url: url, type: 'URL_UPDATED' }
                });
            });

            await Promise.all(requests);
            console.log(`✅ تم إرسال مجموعة من ${batch.length} روابط.`);

            // تأخير 5 ثوانٍ بين كل دفعة (هذا هو مفتاح حل الـ 429)
            if (i + batchSize < games.length) {
                console.log("⏳ انتظار 5 ثوانٍ لتهدئة السيرفر...");
                await sleep(5000);
            }
        }

        console.log("🏁 انتهت العملية بالكامل بنجاح!");
    } catch (error) {
        console.error("❌ خطأ:", error.message);
        process.exit(1);
    }
}

startProcess();
