const express = require('express');
const cors = require('cors');
const midtransClient = require('midtrans-client');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// 1. KONFIGURASI KUNCI (Ganti dengan Key Anda sendiri)
const MIDTRANS_SERVER_KEY = 'MASUKKAN_SERVER_KEY_MIDTRANS_ANDA';
const FONNTE_TOKEN = 'MASUKKAN_TOKEN_FONNTE_ANDA';
const NOMOR_WA_PEMILIK = '6282111938330'; // Nomor WA Anda untuk menerima notifikasi order

let snap = new midtransClient.Snap({
    isProduction: false, // Set ke true jika sudah live/bukan sandbox
    serverKey: MIDTRANS_SERVER_KEY
});

// 2. ENDPOINT: MEMBUAT TRANSAKSI VIRTUAL ACCOUNT
app.post('/api/checkout', async (req, res) => {
    try {
        const { customer_name, customer_address, bank_choice, gross_amount, cart_items } = req.body;
        const orderId = 'NC-' + Date.now(); // Membuat ID Unik otomatis (Contoh: NC-171887...)

        // Menentukan format kode bank untuk Midtrans
        let bankCode = 'bca';
        if (bank_choice.includes('BJB') || bank_choice.includes('BJB')) {
            bankCode = 'bni'; // Jika BJB belum aktif di sandbox, umumnya dialihkan via jaringan BNI/Mandiri
        }

        let parameter = {
            "payment_type": "bank_transfer",
            "transaction_details": {
                "order_id": orderId,
                "gross_amount": gross_amount
            },
            "bank_transfer": {
                "bank": bankCode
            },
            "customer_details": {
                "first_name": customer_name,
                "billing_address": { "address": customer_address }
            }
        };

        // Kirim permintaan ke Midtrans core API
        let coreApi = new midtransClient.CoreApi({ isProduction: false, serverKey: MIDTRANS_SERVER_KEY });
        const chargeResponse = await coreApi.charge(parameter);

        let vaNumber = chargeResponse.va_numbers[0].va_number;

        // Kirim detail instruksi VA awal ke WhatsApp Pembeli via Fonnte
        let pesanWA = `Halo *${customer_name}*, pesanan Anda di *NOODLE CRAFT* telah dikunci.\n\n` +
                      `Silakan transfer Rp ${gross_amount.toLocaleString('id-ID')} ke Virtual Account *${bankCode.toUpperCase()}*:\n` +
                      `👉 *${vaNumber}*\n\n` +
                      `Sistem akan memproses antrean gilingan otomatis setelah Anda membayar. Terima kasih!`;

        await axios.post('https://api.fonnte.com/send', {
            target: NOMOR_WA_PEMILIK, // Ganti ke nomor pembeli jika form input memiliki field nomor HP
            message: pesanWA
        }, {
            headers: { 'Authorization': FONNTE_TOKEN }
        });

        res.json({
            success: true,
            order_id: orderId,
            bank: bankCode,
            va_number: vaNumber
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. ENDPOINT WEBHOOK: MENERIMA NOTIFIKASI OTOMATIS JIKA BANK SUDAH DIBAYAR
app.post('/api/midtrans-callback', async (req, res) => {
    const notification = req.body;

    if (notification.transaction_status === 'settlement') {
        const orderId = notification.order_id;
        const amount = notification.gross_amount;

        // Teks Notifikasi Sukses yang akan otomatis terkirim
        let pesanSukses = `🔥 *PESANAN MASUK & SUDAH LUNAS* 🔥\n` +
                          `Order ID: ${orderId}\n` +
                          `Total Dana: Rp ${parseFloat(amount).toLocaleString('id-ID')}\n` +
                          `Status: Lunas (Verifikasi Otomatis Bank)\n\n` +
                          `Silakan tim gilingan segera memproses pesanan ini untuk jadwal subuh nanti.`;

        // Kirim ke WA Pemilik Bisnis/Dapur Produksi
        await axios.post('https://api.fonnte.com/send', {
            target: NOMOR_WA_PEMILIK,
            message: pesanSukses
        }, {
            headers: { 'Authorization': FONNTE_TOKEN }
        });
    }

    res.status(200).send('OK');
});

app.listen(3000, () => console.log('Server Backend aktif di port 3000'));
