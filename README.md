# YouTube Tahlil

O'z kanallaringiz va raqiblaringiz uchun bepul YouTube tahlil studiyasi (o'zbek tilida).

**Manzil:** https://otabek19920722.github.io/youtube-tahlil/

## Bo'limlar
- **Kunlik hisobot** — o'z kanallaringiz kechagidan beri qanday o'zgardi, yangi videolar qanchalik tez, bugungi maslahatlar, saqlangan raqiblarning hit videolari.
- **Izohlar** — barcha videolardagi javob kutayotgan izohlar bitta ro'yxatda, AI uchun javob so'rovi.
- **Studio statistikasi** — YouTube Analytics (Google bilan ulanadi): ko'rish soatlari, ushlanish, manbalar, qidiruv so'zlari, yosh/jins, mamlakatlar.
- **Kanal tahlili** (+ o'xshash kanallar), **Video tahlili** (+ tomoshabin ushlanishi), **Solishtirish**, **Kalit so'z**, **Trendlar**, **Kuzatuv**, **Thumbnail sinovi**.

## Telegram'ga kunlik hisobot (ixtiyoriy)
`.github/workflows/kunlik-hisobot.yml` har kuni 17:07 (Koreya vaqti) da `youtube-tahlil/scripts/kunlik-hisobot.mjs` ni ishga tushiradi.
Kerakli maxfiy qiymatlar (Settings → Secrets and variables → Actions): `YT_API_KEY`, `TG_BOT_TOKEN`, `TG_CHAT_ID`.
Kanallar ro'yxati: `youtube-tahlil/data/kanallar.json`. O'sish tarixi: `youtube-tahlil/data/history.json`.
Batafsil yo'riqnoma dasturning o'zida: Sozlamalar → «Telegram'ga kunlik hisobot».
