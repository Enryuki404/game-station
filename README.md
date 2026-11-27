# 🎮 Game Station — Arcade & Table Hub

**Game Station** adalah aplikasi web *all-in-one* yang menghadirkan 6 permainan papan, fisika 2D, dan kartu klasik dalam satu antarmuka modern bertema *dark arcade lounge*.

## ✨ Daftar Game
- **UNO Classic** — Dek penuh 108 kartu, mode lawan Bot maupun Mabar Online 2–4 pemain (anti-intip kartu di server + opsi isi Bot).
- **Catur Master** — Aturan catur resmi (Rokade, En Passant, Promosi, Skakmat), bidak Staunty 3D, AI Minimax 3 level, 2P Lokal, serta Mabar Online 1v1 dengan perspektif Putih/Hitam terkunci di masing-masing layar.
- **Karambol Pro** — Simulasi fisika papan kayu 2D (*sub-frame interpolation*), aturan Ratu Merah, lawan AI, 2P Lokal, & Mabar Online 1v1.
- **Billiard 8-Ball Pool** — Meja biliar 16 bola dengan panduan bidik *ghost-ball*, *Ball-in-Hand*, lawan AI, 2P Lokal, & Mabar Online 1v1.
- **Blackjack 21** — Shoe 6 dek, Hit/Stand/Double Down/Split, dan bayaran Natural Blackjack 3:2.
- **Texas Hold'em Poker** — Meja 4 pemain melawan 3 AI dengan evaluasi kombinasi lengkap (High Card hingga Royal Flush) & penanganan *side-pot*.

## 🚀 Menjalankan Secara Lokal
```bash
npm install
npm run server   # Backend Socket.IO di port 3001
npm run dev      # Frontend Vite di port 5173
```

## 🌐 Deploy Gratis (Render)
Proyek ini sudah dilengkapi `render.yaml` (`npm install && npm run build`, `node server/index.mjs`) untuk di-deploy sebagai 1 layanan Web gratis di Render.com.
