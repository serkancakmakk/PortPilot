"use strict";

// Süreç-ömrü bellek şifreleme. Kimlik bilgileri (parola / özel anahtar), otomatik
// yeniden bağlanma için bellekte tutulması gerektiğinde DÜZ METİN olarak değil,
// her süreç başlangıcında üretilen rastgele bir anahtarla AES-256-GCM ile
// şifrelenip saklanır. Anahtar yalnızca bellektedir, diske yazılmaz; süreç bitince
// tüm sırlar erişilemez olur.
//
// Not: Bu, aynı süreç belleğini okuyabilen bir saldırgana karşı mutlak koruma
// değildir (anahtar da bellektedir); amaç sırların oturum haritasında/heap
// dökümünde düz metin durmamasıdır.

const crypto = require("crypto");

const KEY = crypto.randomBytes(32); // süreç ömrü boyunca sabit, rastgele

// Bir nesneyi şifreli buffer'a mühürle
function seal(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  const enc = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]); // [12 iv][16 tag][...]
}

// Mühürlü buffer'ı aç
function open(buf) {
  if (!buf) return null;
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString("utf8"));
}

module.exports = { seal, open };
