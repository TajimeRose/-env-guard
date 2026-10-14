# 🛡️ Env-Guard (Environment Variable Audit & Auto-sync Tool)

> เครื่องมือ Static Analysis น้ำหนักเบาสำหรับตรวจสอบและซิงค์ความถูกต้องของ Environment Variables ระหว่างโค้ดและ `.env.example` แบบอัตโนมัติ พร้อมระบบป้องกัน Secret Leak ก่อนหลุดสู่ Git

---

## 📌 สารบัญ (Table of Contents)
1. [ความเป็นมาและปัญหา (Problem Statement)](#1-ความเป็นมาและปัญหา-problem-statement)
2. [ทำไมต้องเป็น Deterministic Tool แทนที่จะสั่ง AI?](#2-ทำไมต้องเป็น-deterministic-tool-แทนที่จะสั่ง-ai)
3. [หลักการทำงานเชิงลึก (Core Mechanics & Architecture)](#3-หลักการทำงานเชิงลึก-core-mechanics--architecture)
4. [ฟีเจอร์การทำงานทั้งหมด (Feature Specifications)](#4-ฟีเจอร์การทำงานทั้งหมด-feature-specifications)
5. [การทำงานร่วมกับ Development Workflow (Git Hook & CI/CD)](#5-การทำงานร่วมกับ-development-workflow-git-hook--cicd)
6. [CLI Interface & Commands](#6-cli-interface--commands)
7. [สเปกการตรวจจับแต่ละภาษา (Polyglot Regex Heuristics)](#7-สเปกการตรวจจับแต่ละภาษา-polyglot-regex-heuristics)
8. [แผนการพัฒนา (Implementation Roadmap)](#8-แผนการพัฒนา-implementation-roadmap)

---

## 1. ความเป็นมาและปัญหา (Problem Statement)

ในการพัฒนาซอฟต์แวร์เป็นทีม ปัญหาที่พบบ่อยมากที่สุดอย่างหนึ่งคือ **"Environment Drift"** และ **"Human Forgetfulness"**:

* **ลืมอัปเดตไฟล์ตัวอย่าง (`.env.example`)**: เมื่อ Developer คนหนึ่งเพิ่มโค้ดเรียก `process.env.STRIPE_SECRET_KEY` แต่ลืมอัปเดตไฟล์ `.env.example` พอเพื่อนร่วมทีมดึงโค้ดล่าสุดไปรัน แอปพลิเคชันจะแครชทันที (Runtime Crash) โดยไม่รู้ว่าต้องใส่ค่าอะไร
* **ซอมบี้ค้างในไฟล์ (Zombie Keys)**: เมื่อฟังก์ชันเก่าถูกลบทิ้งไปแล้ว แต่ Key ใน `.env.example` ยังคงค้างอยู่เป็นปีๆ รกไฟล์ และไม่มีใครกล้าลบเพราะไม่แน่ใจว่ายังมีจุดไหนเรียกใช้อยู่
* **ความลับหลุด (Secret Leak)**: เผลอใส่ API Key หรือ Password ของจริงลงไปใน `.env.example` แล้วสั่ง `git push` ขึ้น GitHub สาธารณะ
* **เสียเวลา Onboarding**: สมาชิกใหม่เข้ามาในทีม ต้องคอยทักถามว่าตัวแปรนี้หมายถึงอะไร ค่า Default คืออะไร

---

## 2. ทำไมต้องเป็น Deterministic Tool แทนที่จะสั่ง AI?

| มิติการเปรียบเทียบ | Deterministic Tooling (Env-Guard) | สั่ง AI ตรวจสอบ (Cursor / LLM API) |
| :--- | :--- | :--- |
| **ความเร็ว (Execution Speed)** | **5 - 15 มิลลิวินาที** (สแกน 1,000 ไฟล์เสร็จทันที) | **5 - 15 วินาที** (ติด Latency เครือข่าย) |
| **ค่าใช้จ่าย (Cost per Run)** | **$0 / ฟรีตลอดกาล** (ทำงานบนเครื่อง Local) | เสียค่า API Token ทุกครั้งที่สแกน Repo |
| **ความแน่นอน (Determinism)** | **แม่นยำ 100%** คืนค่า Exit Code `0` หรือ `1` แน่นอน | มีความสุ่ม (Stochastic) อาจตาฝาดหรือหลอน |
| **การทำงานใน CI/CD** | ติดตั้งและรันใน Git Pre-commit / GitHub Actions ได้ทันที | ไม่เหมาะกับ CI Pipeline เพราะช้าและอาจติด Rate Limit |
| **ความเป็นส่วนตัว (Privacy)** | โค้ดทั้งหมดอยู่บนเครื่อง ไม่ส่งออกภายนอก | อาจต้องส่งบริบทโค้ดออกไปยังผู้ให้บริการภายนอก |

---

## 3. หลักการทำงานเชิงลึก (Core Mechanics & Architecture)

การทำงานของเครื่องมือจะแบ่งออกเป็น 4 ขั้นตอนหลัก (4-Stage Pipeline):

```
                   ┌─────────────────────────────┐
                   │   Project Source Files      │
                   │ (.js, .ts, .py, .go, .rs)   │
                   └──────────────┬──────────────┘
                                  │ (Stage 1: Static Scan)
                                  ▼
                   ┌─────────────────────────────┐
                   │  Code Keys Set              │
                   │  {"PORT", "DATABASE_URL"}   │
                   └──────────────┬──────────────┘
                                  │
                                  ├────────────────────────┐
                                  │                        │
┌───────────────────────────┐     │                        │
│   .env.example File       │     │                        │
└─────────────┬─────────────┘     │                        │
              │ (Stage 2: Parse)  │                        │
              ▼                   │                        │
┌───────────────────────────┐     │ (Stage 3: Diff Engine) │
│  Example Keys Set         │     │                        │
│  {"PORT", "OLD_ZOMBIE"}   ├─────┘                        │
└─────────────┬─────────────┘                              │
              │                                            │
              ▼                                            ▼
   [Secret Leak Check]                        ┌────────────────────────┐
              │                               │      Audit Result      │
              ▼                               │ - Missing: DATABASE_URL│
   [Exit 1 if Leaked]                         │ - Zombie: OLD_ZOMBIE   │
                                              └────────────┬───────────┘
                                                           │
                                                           │ (Stage 4: Auto-Fix)
                                                           ▼
                                              ┌────────────────────────┐
                                              │ Updated .env.example   │
                                              │ PORT=3000              │
                                              │ DATABASE_URL=""        │
                                              └────────────────────────┘
```

### Stage 1: Static Code Scanner (ตัวแกะโค้ด)
* ทำงานผ่านระบบ Pattern Matching และ Heuristic Regex สแกนหาคำสั่งเรียก Environment Variables ในแต่ละภาษา
* กรองไฟล์และโฟลเดอร์ที่ไม่เกี่ยวข้องออกโดยอัตโนมัติ (เช่น `.git/`, `node_modules/`, `dist/`, `vendor/`, `tests/fixtures/`)
* กรองบรรทัดที่เป็น Comment ออก เพื่อไม่ให้นับ Key ปลอมที่อยู่ในข้อความอธิบาย

### Stage 2: Env File Parser (ตัวอ่านไฟล์ .env.example)
* แยก Key-Value ตามข้อกำหนด Dotenv Standard
* จดจำ Comment (`# database config`), บรรทัดว่าง, และลำดับบรรทัดเดิมไว้อย่างแม่นยำ เพื่อคงโครงสร้างไฟล์เดิมไว้ครบถ้วน

### Stage 3: Diff Engine & Secret Inspector
* **Set Difference**:
  * Missing Keys = `Code_Keys - Example_Keys` (โค้ดต้องการ แต่ไม่มีในตัวอย่าง)
  * Zombie Keys = `Example_Keys - Code_Keys` (มีในตัวอย่าง แต่โค้ดเลิกใช้แล้ว)
* **Secret Leak Detector**: ตรวจสอบ Value ใน `.env.example` หากพบค่าที่มีความเสี่ยงเป็น Secret จริง (เช่นขึ้นต้นด้วย `sk_live_`, `ghp_`, `eyJ...` หรือค่าที่มี Shannon Entropy สูงผิดปกติ) จะหยุดการทำงานและเตือนทันที

### Stage 4: Reporter & Auto-Fix Engine
* **Audit**: แสดงสรุปผลทาง Terminal ด้วยสีสันที่ชัดเจน พร้อมระบุบรรทัดและไฟล์ต้นทาง
* **Auto-Fix (`--fix`)**: นำ Missing Keys ไปต่อท้ายไฟล์ `.env.example` ให้ทันที โดยไม่ลบ Comment เดิมทิ้ง

---

## 4. ฟีเจอร์การทำงานทั้งหมด (Feature Specifications)

### 4.1 Core Features
1. **Bi-directional Audit**:
   - แจ้งเตือนตัวแปรที่ขาด (Missing) ➔ เสี่ยงทำให้ระบบพัง
   - แจ้งเตือนตัวแปรที่เกิน (Zombie) ➔ โค้ดเลิกใช้แล้ว รกไฟล์
2. **Safe Auto-Sync (`--fix`)**:
   - เติมตัวแปรที่ขาดลงใน `.env.example` ให้อัตโนมัติในรูปแบบ `KEY_NAME=""`
   - สามารถระบุ `--prune` ร่วมด้วยเพื่อตัด Zombie Keys ออกอัตโนมัติ
3. **Secret Leak Detection**:
   - สแกนจับ Password, Token, Private Key ที่เผลอใส่ใน `.env.example`
4. **Zero-Configuration Out-of-the-Box**:
   - ใช้งานได้ทันทีโดยไม่ต้องเขียนไฟล์คอนฟิก ระบบจะตรวจจับภาษาและประเภทโปรเจกต์เอง

### 4.2 Extended / Killer Features
1. **Type-Safe Schema Export**:
   - ธง `--generate-types` สามารถสร้างไฟล์ `env.d.ts` (TypeScript) หรือ `env.schema.ts` (Zod Schema) จากตัวแปรที่สแกนเจอให้อัตโนมัติ
2. **Interactive Onboarding Mode (`--interactive`)**:
   - หากเจอ Missing Key ตัว CLI จะเปิดหน้าต่างถามใน Terminal:
     > *"พบ STRIPE_WEBHOOK_SECRET ใน src/billing.ts — ตัวแปรนี้เป็น Required หรือไม่? ต้องการใส่ค่าตัวอย่างหรือคำอธิบายกำกับไหม?"*
3. **Single Binary Distribution**:
   - คอมไพล์เป็นไฟล์ Binary ตัวเดียว (เขียนด้วย Go หรือ Rust) ขนาดประมาณ 5-8MB รันได้ทันทีโดยไม่ต้องติดตั้ง Node หรือ Python

---

## 5. การทำงานร่วมกับ Development Workflow (Git Hook & CI/CD)

### 5.1 Git Pre-commit Hook (ป้องกันก่อน Commit)
ผูกคำสั่งเข้ากับ Git Hook ผ่าน Husky หรือ Lefthook:

```bash
# .husky/pre-commit
env-guard check --strict
```
* หากลืมอัปเดต `.env.example` คำสั่ง Git Commit จะถูกยกเลิกทันที พร้อมบอกว่าขาดตัวแปรใด

### 5.2 GitHub Actions (CI Gate)
สร้าง Workflow เพื่อตรวจสอบทุก Pull Request:

```yaml
name: Env Audit CI
on: [pull_request, push]

jobs:
  env-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Env-Guard
        run: |
          curl -sSL https://get.env-guard.dev | sh
          ./env-guard check --strict
```

---

## 6. CLI Interface & Commands

| คำสั่ง | คำอธิบาย |
| :--- | :--- |
| `env-guard check` | สแกนหาความต่างและรายงานผล (Audit mode) |
| `env-guard check --strict` | โหมดเข้มงวด: หากพบ Missing หรือ Secret รั่วไหล จะ Exit ด้วย Code 1 |
| `env-guard fix` | เติม Missing Keys ลงใน `.env.example` ให้อัตโนมัติ |
| `env-guard fix --prune` | เติม Missing Keys พร้อมลบ Zombie Keys ที่ไม่ได้ใช้ออก |
| `env-guard gen-schema` | สร้าง Zod / TypeScript Schema จากตัวแปรที่สแกนเจอ |

### Exit Codes:
* `0` : ทุกอย่างถูกต้อง ซิงค์ตรงกัน 100%
* `1` : ตรวจพบ Missing Keys หรือ Secret Leak (บล็อก CI)
* `2` : ข้อผิดพลาดทางเทคนิค (เช่น ไม่พบไฟล์ หรือ Syntax พัง)

---

## 7. สเปกการตรวจจับแต่ละภาษา (Polyglot Regex Heuristics)

| ภาษา | คำสั่งที่ตรวจจับ | Regex Pattern ที่ใช้ดักจับ |
| :--- | :--- | :--- |
| **JavaScript / TypeScript** | `process.env.KEY`, `process.env["KEY"]` | `(?:process\.env(?:\.([A-Z0-9_]+)|\[['"`]([A-Z0-9_]+)['"`]\]))` |
| **Vite / Next.js / Astro** | `import.meta.env.VITE_KEY` | `(?:import\.meta\.env(?:\.([A-Z0-9_]+)|\[['"`]([A-Z0-9_]+)['"`]\]))` |
| **Python** | `os.getenv("KEY")`, `os.environ["KEY"]` | `(?:os\.(?:getenv|environ(?:\[|\.get\())\(['"`]([A-Z0-9_]+)['"`]\))` |
| **Go** | `os.Getenv("KEY")`, `os.LookupEnv("KEY")` | `(?:os\.(?:Getenv|LookupEnv)\(['"`]([A-Z0-9_]+)['"`]\))` |
| **Rust** | `env::var("KEY")`, `dotenv!("KEY")` | `(?:(?:env::var|dotenv!)\(['"`]([A-Z0-9_]+)['"`]\))` |

---

## 8. แผนการพัฒนา (Implementation Roadmap)

1. **Phase 1 (MVP)**:
   - CLI Engine พื้นฐานเขียนด้วย Go หรือ Node.js
   - สแกน Node.js / TypeScript (`process.env`)
   - ระบบอ่านและเขียน `.env.example` แบบคง Comment
2. **Phase 2 (Polyglot & Security)**:
   - เพิ่ม Regex รองรับ Python, Go, Rust
   - เพิ่มตัวกรอง High Entropy / Pattern Secret Leaks
3. **Phase 3 (Ecosystem & DX)**:
   - สร้าง GitHub Action สำเร็จรูป
   - ทำ Type & Zod Schema Generator
   - ทำ Interactive Wizard สำหรับ Terminal
