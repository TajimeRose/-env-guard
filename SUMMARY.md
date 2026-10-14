# Env-Guard Implementation Summary

## ภาพรวมโปรเจกต์
Env-Guard เป็นเครื่องมือ Static Analysis น้ำหนักเบาแบบ **Zero External Dependency** (ไม่มี external npm dependencies) ทำงานบน Node.js v22+ ด้วย Native TypeScript / ESM สำหรับตรวจสอบความสอดคล้องระหว่าง Environment Variables ใน Codebase กับไฟล์ `.env.example` พร้อมระบบตรวจจับ Secret Leak

---

## สถาปัตยกรรมและไฟล์ที่พัฒนา

### 1. Core Modules (`src/`)
- **`src/entropy.ts`**
  - คำนวณ Shannon Entropy ด้วย `Math.log2`
  - ตรวจจับ Known Secret Patterns: AWS Access Key, JWT, Private Keys, Stripe Secret Key, GitHub Token, Google API Key
  - ตรวจจับ Generic High Entropy Secrets (Entropy > 4.5 และความยาว >= 16 ตัวอักษร)
- **`src/env-parser.ts`**
  - แยกโครงสร้างบรรทัดในไฟล์ `.env.example` โดยรักษาสภาพ Comment, Whitespace และ Blank Line แบบ 1:1
  - แปลงกลับเป็นข้อความเดิม (Roundtrip Serializer) โดยไม่สูญเสียการจัดหน้า
- **`src/scanner.ts`**
  - Static Code Scanner แบบ Polyglot รองรับ:
    - JavaScript / TypeScript (`process.env.VAR`, `process.env['VAR']`, `import.meta.env.VAR` พร้อม optional chaining)
    - Python (`os.environ.get`, `os.getenv`, `os.environ[...]` รองรับ fallback default argument)
    - Go (`os.Getenv`, `os.LookupEnv`)
    - Rust (`env::var`, `std::env::var`)
  - ข้ามโฟลเดอร์ที่ไม่เกี่ยวข้อง (`node_modules`, `.git`, `dist`, `build`, `vendor`, `.venv` ฯลฯ)
  - ข้ามบรรทัดคอมเมนต์ทั้ง single-line และ block comments
- **`src/diff.ts`**
  - เปรียบเทียบรายการตัวแปรระหว่าง Codebase และ `.env.example`
  - จำแนกเป็น: `missingInEnv`, `zombieInEnv`, `synced`, และ `secretLeaks`
- **`src/fixer.ts`**
  - กลไก Auto-Fix: เพิ่มตัวแปรที่ขาด (`missingInEnv`) ต่อท้ายไฟล์ในรูปแบบ `KEY=` โดยรักษาโครงสร้างเดิม
  - กลไก Safe Pruning: ลบตัวแปรซอมบี้ (`zombieInEnv`) เมื่อระบุ `--prune` โดยคงคอมเมนต์และบรรทัดว่างรอบข้างไว้
- **`src/cli.ts`**
  - ตัวประมวลผลคำสั่ง CLI ด้วย `node:util` `parseArgs` (Native Stdlib)
  - จัดการ Exit Codes:
    - `0`: ซิงค์สมบูรณ์ ไม่มี secret leak
    - `1`: พบ drift (missing vars, หรือ zombie vars ในโหมด strict) หรือพบ secret leak
    - `2`: Fatal error (พาธไม่ถูกต้อง, อ่านไฟล์ไม่สำเร็จ)
  - รองรับคำสั่ง `check` (default, flags: `--strict`, `--env-file`, `--dir`) และ `fix` (flags: `--prune`, `--env-file`, `--dir`)

### 2. Entry Point (`bin/`)
- **`bin/env-guard.js`**
  - Executable script สำหรับรันคำสั่ง CLI ผ่าน `node bin/env-guard.js`

### 3. ชุดการทดสอบ (`test/`)
รันผ่าน Native Test Runner (`node --test`) ผ่าน 100% (40/40 tests):
- `test/entropy.test.ts`: ทดสอบการคำนวณ Shannon Entropy และตรวจจับ Secret Patterns (4 tests)
- `test/env-parser.test.ts`: ทดสอบการ parse และ serialize รักษาโครงสร้าง 1:1 (3 tests)
- `test/scanner.test.ts`: ทดสอบ Polyglot Scanner และการข้ามคอมเมนต์/โฟลเดอร์ (6 tests)
- `test/diff.test.ts`: ทดสอบ Diff Engine และตรวจจับ Secret Leaks (4 tests)
- `test/fixer.test.ts`: ทดสอบ Auto-Fix และ Safe Pruning (5 tests)
- `test/cli.test.ts`: ทดสอบ CLI Arguments, Exit Codes และ Output Formatting (13 tests)
- `test/e2e.test.ts`: ทดสอบ End-to-End จริงกับโปรเจกต์ Polyglot ผ่าน Binary Subprocess (5 tests)

---

## การรันคำสั่งตรวจสอบและทดสอบ
- **รันชุดทดสอบทั้งหมด:**
  ```bash
  npm test
  ```
- **ตรวจสอบ Codebase:**
  ```bash
  node bin/env-guard.js check
  node bin/env-guard.js check --strict
  ```
- **Auto-Fix Missing Keys:**
  ```bash
  node bin/env-guard.js fix
  node bin/env-guard.js fix --prune
  ```
