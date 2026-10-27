# RuneCode — ผจญภัยด้วย Python

เกมเรียน Python สำหรับนักเรียน ม.4 ที่เพิ่งเริ่มเขียนโปรแกรม มี 6 บท 24 ห้อง และ 3 อาชีพ โจทย์อังกฤษสั้น ๆ เมนูภาษาไทย พร้อมโครงโค้ดให้เติม คำใบ้ และการรัน Python จริงด้วย Pyodide

โค้ดเกมอยู่ใน [python-dungeon-v2](python-dungeon-v2) ดู [รายการโจทย์](python-dungeon-v2/docs/SOURCE-CURRICULUM.md) และ [บอสทบทวน](python-dungeon-v2/docs/BOSS-CHALLENGES.md)

## เปิดเกมในเครื่อง

ใช้ Node.js 22.12+ หรือ 24+

```sh
cd python-dungeon-v2
npm ci
npm run dev
```

เปิด URL ที่ Vite แสดง โดยปกติคือ `http://127.0.0.1:5173/` การติดตั้งจะเตรียม Python runtime ให้เอง ความคืบหน้าบันทึกในเบราว์เซอร์และส่งออกเป็นไฟล์ได้

## ตรวจสอบและสร้างเกม

รันจากโฟลเดอร์ `python-dungeon-v2`:

```sh
npm run typecheck
npm test
npm run build
```

ไฟล์เกมที่สร้างแล้วอยู่ใน `python-dungeon-v2/dist/` และมีระบบเตรียมเล่นออฟไลน์ โจทย์รุ่นล่าสุดผ่านการทดสอบ 637 รายการและการทดสอบเบราว์เซอร์ที่เกี่ยวข้อง 7 กรณี
