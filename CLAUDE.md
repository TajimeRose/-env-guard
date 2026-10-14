# 🤖 CLAUDE.md - Env-Guard Project & Agent Guidelines

## 🎯 Project Overview
Env-Guard เป็นเครื่องมือ Static Analysis น้ำหนักเบา (Zero/Low Dependency) สำหรับตรวจสอบความสอดคล้องระหว่าง Environment Variables ใน Codebase และ `.env.example` พร้อมตรวจจับ Secret Leak

---

## ⚡ Golden Rules (กฎเหล็กการทำงาน)

### 1. 🧩 Micro-Tasking (แตกงานย่อย ป้องกัน Token / Gemini Cutoff)
> **ปัญหาที่ต้องป้องกัน:** โมเดล LLM เช่น Gemini หรือ Claude มักจะตัดข้อความทิ้ง (Output/Context Truncation) หากสั่งให้เขียนโค้ดทั้งก้อนในรอบเดียว ทำให้ไฟล์ขาด วิเคราะห์ผิดพลาด หรือแฮงก์

* **ห้ามทำรวดเดียวเด็ดขาด (Strictly One Step at a Time):**
  * ทุกคำสั่งต้องผ่านการซอยเป็น **Checklist ข้อย่อยระดับอะตอม (Atomic Tasks)** ที่ใช้เวลาสั้นและแก้ไขไฟล์ทีละน้อย
  * ทำทีละ 1 ข้อ ➔ ทดสอบและสรุปผลสั้นๆ ➔ หยุดรอให้ขั้นตอนผ่าน ก่อนเริ่มข้อถัดไป
* **Short & Crisp Outputs:**
  * ตอบเฉพาะประเด็นสำคัญ: แจ้งว่าแก้ไฟล์ไหน บรรทัดไหน รันผลตรวจอะไร ห้ามพ่นคำบรรยายเยิ่นเย้อเพื่อประหยัด Token Budget

### 2. 🦥 Lazy Senior Developer (Ponytail Ladder)
* **The best code is the code never written:** แก้ปัญหาด้วยโค้ดใหม่ที่น้อยที่สุด
* **Stdlib First:** ใช้ Standard Library และความสามารถ Native ของภาษาก่อนเสมอ ห้ามเพิ่ม Dependency ภายนอกหากไม่จำเป็น
* **Shortest Diff Wins:** รักษาโครงสร้างเดิมของโปรเจกต์ ไม่สร้าง Wrapper, Factory, หรือ Abstraction ที่ไม่มีใครร้องขอ

---

## 🔄 Agent Pipeline & Workflow

```text
[User สั่งงาน]
      ↓
[1. planner]        -> วิเคราะห์โค้ด + แตก Checklist งานย่อย (รอ User กดยืนยัน)
      ↓
[2. coder]          -> ดำเนินการ "ทีละ 1 ข้อ" + รัน Self-check/Test + สรุปสั้น
      ↓
[3. code-reviewer]  -> ตรวจสอบความถูกต้อง, ความปลอดภัย และตัด Over-engineering
```

1. **Step 1: Plan First:**
   - เรียก Sub-agent `planner` เพื่อทำความเข้าใจขอบเขตงาน
   - ลิสต์เฉพาะส่วนที่ต้องแตะ (Callers, Files, Tests)
   - **หยุดรอผู้ใช้กดยืนยันแผนก่อนเริ่มแตะต้องโค้ดเสมอ**

2. **Step 2: Incremental Execution:**
   - ส่งต่อให้ `coder` ทำงานทีละ 1 สเต็ป
   - เขียนโค้ดสั้นที่สุด ไม่เกิน 1-2 ฟังก์ชันต่อเทิร์น
   - รันคำสั่งตรวจสอบ (เช่น Unit test หรือ Lint) ทันทีหลังแก้ไข

3. **Step 3: Quality Gate & Review:**
   - ส่งโค้ดที่แก้ให้ `code-reviewer` ตรวจสอบ Diff
   - เช็คว่าไม่มี Secret รั่วไหล และไม่มี Bloat Code ก่อนส่งมอบให้ผู้ใช้

---

## 🛠️ Verification & Test Commands
* **Run Tests:** `go test ./...` หรือ `npm test` หรือ `pytest`
* **Static Check:** `git diff --stat` (ตรวจสอบขนาดของ Diff ให้สั้นที่สุดเสมอ)
