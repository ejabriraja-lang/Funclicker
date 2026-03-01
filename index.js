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
        console.log("🔍 جاري جلب الألعاب من Firebase...");
        const snapshot = await db.collection('artifacts').doc('gaming-hub-pro')
                                 .collection('public').doc('data')
                                 .collection('games').get();

        const tokens = await jwtClient.authorize();
        
        // تحويل الـ docs إلى مصفوفة لسهولة التحكم
        const games = snapshot.docs;
        console.log(`🚀 تم العثور على ${games.length} لعبة. سأبدأ الإرسال بحذر...`);

        for (const doc of games) {
            const game = doc.data();
            if (!game.slug) continue; // تخطي إذا لم يوجد اسم رابط

            const url = `https://funclickergame.com/game/${game.slug}`;
            const fakeGclid = 'EAIaIQobChMI' + Math.random().toString(36).substring(2, 12).toUpperCase();
            const targetUrl = `${url}?gclid=${fakeGclid}`;

            try {
                // إرسال لـ Google Indexing API
                await axios.post('https://indexing.googleapis.com/v3/urlNotifications:publish', {
                    url: targetUrl,
                    type: 'URL_UPDATED'
                }, {
                    headers: { 'Authorization': `Bearer ${tokens.access_token}` }
                });

                console.log(`✅ تم إرسال: ${targetUrl}`);
            } catch (err) {
                if (err.response && err.response.status === 429) {
                    console.error("⚠️ وصلنا للحد الأقصى من جوجل (Quota Exceeded). سأتوقف الآن.");
                    break; // التوقف عن الإرسال فوراً إذا ظهر خطأ 429
                }
                console.error(`❌ فشل إرسال ${game.slug}:`, err.message);
            }

            // زيادة التأخير لـ 2000 مللي ثانية (ثانيتين) بدلاً من ثانية واحدة
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    } catch (error) {
        console.error("❌ خطأ عام:", error.message);
        process.exit(1);
    }
}

startHammer();
