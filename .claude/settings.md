# 🛡️ Settings & Permissions Specification

ไฟล์นี้อธิบายการกำหนดสิทธิ์และความปลอดภัยสำหรับ Claude Code ในโปรเจกต์ `env-guard`

## การทำงานร่วมกับ `settings.json`
Claude Code จะอ่านการตั้งค่าสิทธิ์อัตโนมัติจาก `.claude/settings.json`

### คำสั่งที่ Whitelist ให้อนุญาตอัตโนมัติ (Auto-approved):
- `git status` และ `git diff`: สำหรับตรวจสอบสถานะและ Diff ของโค้ด
- `npm test`, `go test`, `pytest`: สำหรับรัน Unit Tests ทันทีหลัง `coder` ทำงานเสร็จในแต่ละสเต็ป

### กฎความปลอดภัย (Security Rules):
- ห้ามรันคำสั่งลบไฟล์รุนแรง (`rm -rf`) หรือ push โค้ดขึ้นรีโมท (`git push`) โดยไม่ได้รับการยืนยันจากผู้ใช้
