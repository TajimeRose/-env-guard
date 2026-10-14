# /review Command

เรียกใช้ Sub-agent `code-reviewer` เพื่อตรวจทานการเปลี่ยนแปลง:
1. ดึง `git diff` ล่าสุด
2. ตรวจสอบความปลอดภัย (ห้ามมี Secret หลุด)
3. ตรวจสอบ YAGNI และ Over-engineering ตามหลัก Ponytail
4. รายงานผลสรุป (PASS หรือจุดที่ควรตัดทิ้ง)
