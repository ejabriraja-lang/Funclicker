const { google } = require('googleapis');
const admin = require('firebase-admin');
const axios = require('axios');

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

async function startHammer() {
    try {
        console.log("🔍 جاري جلب آخر 10 ألعاب مضافة من Firebase...");
        
        // تعديل الاستعلام: ترتيب حسب التاريخ (أحدث أولاً) وجلب 10 فقط
        // ملاحظة: تأكد أن لديك حقل 'createdAt' أو 'timestamp' في قاعدة بياناتك
        const snapshot = await db.collection('artifacts').doc('gaming-hub-pro')
                                 .collection('public').doc('data')
                                 .collection('games')
                                 .orderBy('createdAt', 'desc') // ترتيب من الأحدث للأقدم
                                 .limit(10) // جلب 10 فقط
                                 .get();

        if (snapshot.empty) {
            console.log("⚠️ لم يتم العثور على ألعاب!");
            return;
        }

        const tokens = await jwtClient.authorize();
        console.log(`🚀 تم العثور على ${snapshot.size} ألعاب جديدة. سأبدأ الإرسال...`);

        for (const doc of snapshot.docs) {
            const game = doc.data();
            const url = `https://funclickergame.com/game/${game.slug}`;
            const fakeGclid = 'EAIaIQobChMI' + Math.random().toString(36).substring(2, 12).toUpperCase();
            const targetUrl = `${url}?gclid=${fakeGclid}`;

            try {
                await axios.post('https://indexing.googleapis.com/v3/urlNotifications:publish', {
                    url: targetUrl,
                    type: 'URL_UPDATED'
                }, {
                    headers: { 'Authorization': `Bearer ${tokens.access_token}` }
                });

                console.log(`✅ تم إرسال: ${targetUrl}`);
            } catch (err) {
                console.error(`❌ فشل إرسال ${game.slug}:`, err.message);
                if (err.response && err.response.status === 429) break; 
            }

            // تأخير ثانيتين للأمان
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    } catch (error) {
        console.error("❌ خطأ:", error.message);
        process.exit(1);
    }
}

startHammer();
