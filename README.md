# 📖 Tnovel (Novel Translation & Reader Platform)

ระบบอ่านและแปลนิยายภาษาอังกฤษ/ต่างประเทศเป็นภาษาไทยแบบอัตโนมัติด้วยเทคโนโลยี **Machine Translation Post-Editing (MTPE)** ผสานพลังระหว่าง **Google Translate (ความเร็วสูง)** และ **Local/Cloud AI LLM (เกลาสำนวนวรรณกรรม)** พร้อมระบบจัดการหลังบ้าน คลังคำศัพท์เฉพาะ (Glossary) และหน้าอ่านนิยายที่ลื่นไหลไร้รอยต่อ

---

## 📑 สารบัญ
1. [สถาปัตยกรรมการทำงาน (Architecture & Pipeline)](#-สถาปัตยกรรมการทำงาน-architecture--pipeline)
2. [3 กฎเหล็กของระบบ (System Invariants)](#-3-กฎเหล็กของระบบ-system-invariants)
3. [ฟีเจอร์เด่น (Key Features)](#-ฟีเจอร์เด่น-key-features)
4. [โครงสร้างสถาปัตยกรรมโมเดล AI (Model-Agnostic LLM)](#-โครงสร้างสถาปัตยกรรมโมเดล-ai-model-agnostic-llm)
5. [เทคโนโลยีที่ใช้ (Tech Stack)](#-เทคโนโลยีที่ใช้-tech-stack)
6. [โครงสร้างโฟลเดอร์ (Directory Structure)](#-โครงสร้างโฟลเดอร์-directory-structure)
7. [การติดตั้งและเริ่มต้นใช้งาน (Getting Started)](#-การติดตั้งและเริ่มต้นใช้งาน-getting-started)
8. [การทดสอบและการตรวจสอบ (Verification & Tests)](#-การทดสอบและการตรวจสอบ-verification--tests)

---

## 🏛️ สถาปัตยกรรมการทำงาน (Architecture & Pipeline)

Tnovel ใช้สถาปัตยกรรมแบบ **Two-Stage Hybrid Translation**:

```text
                               ┌─────────────────┐
                               │   ReaderView    │ (ผู้อ่านเปิดอ่านตอนที่ N)
                               └────────┬────────┘
                                        │ (1) Dwell-Time 5s + Client Abort
                                        ▼
                               ┌─────────────────┐
                               │ JIT Fetch API   │ (ดึงเนื้อหาตอนที่ N+1 ล่วงหน้า)
                               └────────┬────────┘
                                        │ (2) ChapterJob & In-Flight Lock (Dedup)
                                        ▼
                             ┌─────────────────────┐
                             │ Host Rate Limiter   │ (3) ป้องกันเว็บต้นทาง (1–2 reqs/host)
                             └──────────┬──────────┘
                                        │
                                        ▼
                                 เว็บนิยายต้นทาง
                                        │
                                        ▼
                               Google Translate API (ดึงร่างเร็ว ~2 วินาที)
                                        │
                                        ▼
                                 contentThGoogle (บันทึกร่างด่วนเข้าฐานข้อมูล)
                                        │
                                        ▼
                             ┌─────────────────────┐
                             │ Polish Queue Worker │ (คิวเกลาสำนวนเบื้องหลัง)
                             └──────────┬──────────┘
                                        │
                             ┌──────────┴──────────┐
                             │ Atomic Lease Lock   │ (Lease 60s + Heartbeat 15s + ownerId)
                             └──────────┬──────────┘
                                        │
                             ┌──────────┴──────────┐
                             │  Glossary Snapshot  │ (Freeze คำศัพท์คงที่ทั้งตอน)
                             └──────────┬──────────┘
                                        │
                                        ▼
                             ILLMProvider (Ollama / Gemini)
                             [Soft Per-Batch Timeout: 180s]
                                        │
                                        ▼
                                Quality Safety Net
                             - Semantic-Safe Name Replacer
                             - Scope-based English Leak Detector
                                        │
                             ┌──────────┴──────────┐
                             │                     │
                       [ทุก Batch สำเร็จ]     [มี Batch ล้มเหลว]
                             │                     │
                             ▼                     ▼
                     contentThPolished       POLISH_FAILED
                     (สถานะ: POLISHED)      (รักษาเนื้อหาเดิม ไม่เซฟร่างผสม,
                                             Reader อ่านฉบับ Google Draft)
```

---

## 🛡️ 3 กฎเหล็กของระบบ (System Invariants)

1. **Atomic Priority Lease Invariant:**
   - ใช้ `ownerId` (UUID) ที่สร้างขึ้นครั้งเดียวในระดับ Job Lifecycle
   - คำสั่ง `heartbeat` และ `release` ต้องตรวจสอบทั้ง `key` และ `ownerId` ตรงกันเสมอ
   - ป้องกัน Stale Process และ Race Condition เมื่อรันแบบ Multi-Process / PM2 100%
   - งานแปลใหม่แบบ Manual ที่ผู้ใช้กดสั่ง จะได้สิทธิ์ใช้ GPU ก่อนงานเบื้องหลังอัตโนมัติ

2. **Last-Known-Good Preservation Invariant:**
   - **ห้ามทำลายหรือล้าง `contentThPolished` เดิมที่ดีอยู่แล้วเด็ดขาด**
   - หากการ Re-polish รอบใหม่มีแม้แต่ 1 Batch ที่ล้มเหลว (`failedBatches > 0`):
     - เนื้อหา `contentThPolished` เดิมจะถูกรักษาไว้ 100%
     - สถานะเปลี่ยนเป็น `POLISH_FAILED`
     - ผู้อ่านยังคงได้อ่านฉบับ Polish เดิมที่สมบูรณ์

3. **All-or-Nothing Polish Invariant:**
   - ต้อง `failedBatches === 0` (สำเร็จ 100% ครบทุกชุด) เท่านั้น จึงจะเปลี่ยนสถานะเป็น `POLISHED` และ Commit ข้อความใหม่ลงฐานข้อมูล
   - ป้องกันปัญหาบทนิยายกลายเป็น "ลูกผสมครึ่ง AI ครึ่ง Google"

---

## ✨ ฟีเจอร์เด่น (Key Features)

### 1. ประสบการณ์การอ่าน (Reader Experience)
- **Silent Preload 3 ด่าน:**
  - **Dwell-Time Gate 5 วินาที:** รอให้อ่านครบ 5 วินาทีก่อนยิง Prefetch ตอนถัดไป เพื่อไม่ให้เปลืองทรัพยากรเมื่อกดข้ามตอน
  - **Client AbortController:** ยกเลิกการรอที่เบราว์เซอร์ทันทีเมื่อเปลี่ยนตอน
  - **Zero-Latency Infinite Scroll:** เลื่อนอ่านต่อเนื่องได้ทันทีโดยไม่ติดหน้าโหลด
- **Customizable Reader:** ปรับขนาดตัวอักษร, ระยะห่างบรรทัด, แบบอักษร (Sarabun, Prompt, etc.), โหมดมืด/สว่าง, และบันทึกตำแหน่งการอ่านอัตโนมัติลง IndexedDB

### 2. หน้ารายละเอียดนิยาย (Novel Detail Tabs)
- **แท็บสารบัญ (Chapters):** ค้นหาตอน, กรองตอน, เรียงลำดับเก่า-ใหม่, แสดงสถานะความพร้อมของแต่ละตอน
- **แท็บคำศัพท์เฉพาะเรื่อง (Glossary Editor):**
  - กำหนดชื่อตัวละคร, สรรพนาม, ทักษะเวทมนตร์, หรือชื่อสถานที่ (อังกฤษ ➔ ไทย)
  - ล็อกคำศัพท์ (`isLocked`) ป้องกัน AI แปลเพี้ยน
- **แท็บการแปล (Translation Panel):**
  - Dashboard แสดงสัดส่วนความคืบหน้า: ✅ POLISHED, ⚡ TRANSLATED_GT, 📝 TOC_ONLY, ❌ FAILED
  - เครื่องมือ Re-translate สำหรับ Admin: เลือกได้ระหว่าง ⚡ แปลเร็ว (Google) หรือ ✨ แปลเกลาคำ (AI Polish)
  - เลือกกลุ่มตอน: ตอนที่ไม่สมบูรณ์, ตอนที่ล้มเหลว, กำหนดช่วงตอน (เช่น 1-50), หรือทุกตอน
  - แถบความคืบหน้าเรียลไทม์ `37 / 100 ตอน` พร้อมปุ่มหยุดชั่วคราว

### 3. ระบบจัดการหลังบ้าน (Admin Dashboard & Ollama Control)
- **Ollama Status & VRAM Controller:**
  - ตรวจสอบสถานะการเชื่อมต่อ Ollama แบบ Real-time (Online, Model Name, VRAM Usage, Active Jobs)
  - ปุ่ม **"เชื่อมต่อโมเดลเข้า VRAM"**: ส่ง `keep_alive: -1` โหลดโมเดลรอไว้บนการ์ดจอพร้อมแปลทันที
  - ปุ่ม **"ตัดการเชื่อมต่อ (คืน VRAM)"**: สั่ง Unload โมเดลเพื่อคืนแรมการ์ดจอไปใช้งานอื่น
  - **Disconnect Guard (Draining State):** ป้องกันการตัดการเชื่อมต่อขณะมีงานแปลค้างอยู่
- **Scraper Drawer:** นำเข้านิยายอัตโนมัติจาก URL ชั้นนำ (FanMTL, NovelLive, Webnovel, RoyalRoad, ScribbleHub, Dek-D)
- **Audit Logs, User Management & Whitelist:** ตรวจสอบประวัติการใช้งานและควบคุมสิทธิ์การเข้าถึง

### 4. User Isolation ในสัญญาณเรียลไทม์
- แนบ `initiatorUserId` ในสัญญาณ Socket.IO ทุกจุด
- แถบสถานะความคืบหน้า (`BackgroundProgressWidget`) จะแสดงผลเฉพาะบนหน้าจอของผู้ใช้ที่เป็นคนสั่งงานเท่านั้น

---

## 🧠 โครงสร้างสถาปัตยกรรมโมเดล AI (Model-Agnostic LLM)

ระบบถูกออกแบบด้วย **Provider Pattern (`ILLMProvider`)** ทำให้สลับโมเดลได้อิสระผ่าน Environment Variable โดยไม่ต้องแก้โค้ดระบบ:

```env
# เลือกระบบ AI: ollama หรือ gemini
AI_PROVIDER=ollama

# กำหนดชื่อโมเดล Ollama ที่ต้องการใช้งาน (Default: qwen2.5:7b)
OLLAMA_MODEL=qwen2.5:7b
# รองรับโมเดลอื่นๆ ได้ทันที เช่น:
# OLLAMA_MODEL=qwen3:8b
# OLLAMA_MODEL=qwen3.5:9b
# OLLAMA_MODEL=gemma3:12b
```

### Quality Safety Net Pipeline
1. **System Prompt (กฎข้อ 7):** บังคับถอดเสียงชื่อบุคคลและสถานที่ให้เป็นภาษาไทย ไม่สั่งห้ามภาษาอังกฤษ 100% เพื่อรักษาคำย่อสากล (HP, MP, GPU, USB, Wi-Fi)
2. **Semantic-Safe Name Replacer:** จับคู่คำศัพท์จาก Glossary แบบ Longest-Match-First และ Word Boundary (`\b`)
3. **Scope-based English Leak Detector:** ตรวจจับคำภาษาอังกฤษที่ตกค้างเฉพาะใน Scope ของ Glossary และซ่อมแซมให้อัตโนมัติ

---

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

| ส่วนของระบบ | เทคโนโลยีที่เลือกใช้ |
| :--- | :--- |
| **Frontend Framework** | [Next.js](https://nextjs.org/) 16 (App Router), [React](https://react.dev/) 18 |
| **Styling & UI** | [Tailwind CSS](https://tailwindcss.com/), [Lucide React](https://lucide.dev/) |
| **State & Storage** | [SWR](https://swr.vercel.app/), IndexedDB via [idb](https://github.com/jakearchibald/idb) |
| **Backend & Realtime** | Node.js Custom Server ([server.js](file:///d:/Web/Tnovel/server.js)), [Socket.IO](https://socket.io/) |
| **Database & ORM** | [SQLite](https://www.sqlite.org/), [Prisma ORM](https://www.prisma.io/) |
| **Scraper** | [Cheerio](https://cheerio.js.org/), [Axios](https://axios-http.com/), [Puppeteer-Core](https://pptr.dev/) |
| **Translation Engine** | Google Cloud Translation API (Stage 1 Draft) |
| **AI LLM Polish** | [Ollama](https://ollama.com/) (Local Qwen Models) / Google Gemini API (Stage 2 Polish) |

---

## 📁 โครงสร้างโฟลเดอร์ (Directory Structure)

```text
Tnovel/
├── app/                              # Next.js App Router Pages & API
│   ├── admin/                        # หน้าแดชบอร์ดผู้ดูแลระบบ
│   ├── api/                          # Backend API Endpoints
│   │   ├── admin/ollama/             # API ควบคุมสถานะและ VRAM ของ Ollama
│   │   ├── chapters/[id]/retranslate/# API สั่งแปลใหม่รายตอน
│   │   ├── chapters/[id]/jit-fetch/  # API ดึงเนื้อหาและแปลล่วงหน้า (JIT)
│   │   └── scrape-and-translate/     # API นำเข้านิยายจากเว็บต้นทาง
│   ├── novels/[id]/                  # หน้ารายละเอียดนิยาย (สารบัญ, Glossary, การแปล)
│   └── read/[id]/                    # หน้าอ่านนิยายสำหรับผู้อ่าน
├── components/                       # React Components
│   ├── BackgroundProgressWidget.tsx  # กล่องแสดงความคืบหน้าการแปล (พร้อม User Isolation)
│   ├── OllamaStatusCard.tsx          # การ์ดควบคุมและมอนิเตอร์ Ollama VRAM ในหน้า Admin
│   ├── ReaderView.tsx                # คอมโพเนนต์หน้าอ่านนิยาย (พร้อม Dwell-Time Preload)
│   └── TranslationPanel.tsx          # แท็บการแปลและเครื่องมือ Re-translate รายบท
├── lib/                              # Core Utilities & Business Logic
│   ├── llm/
│   │   └── provider.ts               # Model-Agnostic ILLMProvider (Ollama & Gemini)
│   ├── translation/
│   │   └── detectEnglishLeak.ts      # Scope-based English Leak Detector
│   ├── batchTranslator.ts            # ตัวประมวลผลการแปลนิยายทั้งเรื่อง
│   ├── googleTranslate.ts            # ตัวเชื่อมต่อ Google Translate API
│   ├── inFlightLock.ts               # Single-flight promise coalescing guard
│   ├── jobQueue.ts                   # Distributed ChapterJob & Worker Lease queue
│   ├── nameReplacer.ts               # Semantic-safe name replacer
│   ├── polishQueue.ts                # Background AI Polish Queue Worker
│   ├── systemLock.ts                 # Atomic Priority Lease Lock (SQLite/PM2-safe)
│   └── translator.ts                 # Prompt builder และฟังก์ชันเรียก LLM
├── prisma/
│   ├── schema.prisma                 # Database Schema (Chapter, SystemLock, Novel, etc.)
│   └── dev.db                        # ฐานข้อมูล SQLite ประจำเครื่อง
├── scripts/                          # สคริปต์ทดสอบระบบและการทำงาน
│   ├── test-architecture.js          # ทดสอบ In-flight lock, Name replacer, Data integrity
│   ├── test-system-lock.ts           # ทดสอบ Atomic Lease, Mutex, และ Stale Owner Recovery
│   └── test-polish-invariants.ts     # ทดสอบ Leak Detector และ Last-Known-Good Preservation
├── server.js                         # Custom Node.js Server ผสาน Next.js + Socket.IO
└── package.json                      # การตั้งค่า Dependencies และ Scripts
```

---

## 🚀 การติดตั้งและเริ่มต้นใช้งาน (Getting Started)

### 1. ข้อกำหนดของระบบ (Prerequisites)
- **Node.js:** เวอร์ชั่น 20 ขึ้นไป (แนะนำ Node.js 22+)
- **Ollama:** ติดตั้งโปรแกรม [Ollama](https://ollama.com/) ในเครื่อง
- **โมเดล AI:** สั่งดึงโมเดลสำหรับเกลาภาษาผ่าน Terminal:
  ```bash
  ollama pull qwen2.5:7b
  ```

### 2. ติดตั้ง Dependencies
```bash
npm install
```

### 3. ตั้งค่า Environment Variables (`.env`)
สร้างหรือแก้ไขไฟล์ `.env` ที่โฟลเดอร์ Root:
```env
DATABASE_URL="file:./dev.db"
PORT=9000

# การตั้งค่า AI เกลาสำนวน
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b

# ความลับของระบบและ JWT
JWT_SECRET=your_jwt_secret_key_here
NEXTAUTH_SECRET=your_nextauth_secret_here

# Google Gemini API (ทางเลือกเสริมกรณีใช้ Cloud Provider)
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE
```

### 4. ซิงค์ฐานข้อมูล (Database Sync)
```bash
npm run db:push
```

### 5. เริ่มต้นรันเซิร์ฟเวอร์สำหรับพัฒนา (Development Mode)
```bash
npm run dev
```
เซิร์ฟเวอร์จะเปิดทำงานที่: **`http://localhost:9000`**

---

## 🧪 การทดสอบและการตรวจสอบ (Verification & Tests)

ระบบมีสคริปต์สำหรับตรวจสอบความถูกต้องของสถาปัตยกรรมและกฎเหล็ก (Invariants) อย่างครบถ้วน:

### 1. ตรวจสอบการคอมไพล์ TypeScript
```bash
npm run lint
# หรือ: npx tsc --noEmit
```

### 2. ทดสอบความปลอดภัยของสถาปัตยกรรม (Architecture Test)
ทดสอบ In-flight deduplication, Name replacer subword collision, และ Data schema:
```bash
node scripts/test-architecture.js
```

### 3. ทดสอบ Atomic Priority Lease & Stale Owner Recovery
ทดสอบ Concurrency Mutex, การแย่ง Lock ของ 2 Process, และการดักจับ Stale Process:
```bash
npx tsx scripts/test-system-lock.ts
```

### 4. ทดสอบ Polish Invariants & Leak Detector
ทดสอบ Scope-based English Leak Detector, การรักษาคำย่อสากล (HP, MP), และการคงอยู่ของ Last-Known-Good Polished Content ในฐานข้อมูล:
```bash
npx tsx scripts/test-polish-invariants.ts
```

---

## 📄 ใบอนุญาต (License)
ลิขสิทธิ์โปรเจกต์ Tnovel จัดทำขึ้นเพื่อการใช้งานภายในและการพัฒนาการอ่านนิยายแปลภาษาไทยอย่างมีประสิทธิภาพ
