# خطة تطوير Chief إلى Agent ذكي حقيقي

الهدف: تحويل Chief من مجرد "شات يرد" إلى **مدير حقيقي** له ذاكرة طويلة، شخصية وروح، يفهم مشاعرك، ويدير فريق Agents كل واحد منهم له أدواته وذاكرته الخاصة، ويوزّع المهام عليهم ويتابعهم ويرجع لك بالنتائج.

---

## الفكرة المعمارية (بإيجاز)

```text
   أنت (Telegram / Web)
          │
          ▼
   ┌─────────────┐     ذاكرة Chief الطويلة (حقائق + مشاعر + قرارات)
   │    Chief    │◄──► ذاكرة المحادثة القصيرة (آخر N رسالة + ملخصات)
   │  Orchestrator│    شخصية ثابتة (system prompt + نبرة)
   └─────┬───────┘
         │ Tools (AI SDK):
         │  • list_agents / create_agent / update_agent
         │  • assign_task / get_task_status
         │  • remember_fact / recall_memory
         │  • reply_to_user
         ▼
   ┌──────────────────────────────────────────┐
   │  Workforce: Researcher, Writer, Coder…   │
   │  كل Agent: ذاكرة خاصة + tools خاصة       │
   └──────────────────────────────────────────┘
```

---

## المراحل

### المرحلة 1 — تحويل Chief إلى Agent حقيقي بـ Tool Calling
بدل ما Chief يرجّع نص فقط، نعطيه **أدوات حقيقية** عبر AI SDK (`tool()` + `stopWhen: stepCountIs(50)`) يقدر يستدعيها بنفسه:
- `list_agents` — يشوف الفريق الحالي
- `create_agent({ name, role, tools, system_prompt })` — ينشئ زميل جديد لما يحتاج تخصص
- `assign_task({ agent_id, title, description, priority })` — يوزّع مهمة
- `get_task_status({ task_id })` — يتابع
- `remember({ key, value, tags })` و `recall({ query })` — يكتب ويسترجع من ذاكرته
- `reply({ text })` — الرد النهائي للمستخدم

النتيجة: Chief يقرر بنفسه: أنشئ Agent؟ كلّف موجود؟ اسأل سؤال توضيحي؟

### المرحلة 2 — الذاكرة الطويلة (Long-term Memory)
جدول `chief_memories` فيه:
- `kind`: fact / preference / emotion / decision / project
- `content`: النص
- `embedding`: vector(1536) للبحث الدلالي
- `importance`: 1-5
- `last_accessed_at`

قبل كل رد، Chief يبحث في الذاكرة (`pgvector` similarity) عن أهم 5-10 ذكريات مرتبطة بالطلب الحالي ويحقنها في الـ system prompt. هذا يعطيه إحساس إنه "يعرفك" حقيقة.

ملخص تلقائي: كل 20 رسالة، نلخّص المحادثة ونحفظها كـ memory دائمة.

### المرحلة 3 — الشخصية والروح (Personality Layer)
- **System prompt موسّع**: اسم، نبرة (ودود/مباشر/مازح حسب اختيارك)، قيم، أسلوب رد بالعربي الفصيح أو العامية حسب ما تكتب.
- **Emotional awareness**: قبل التنفيذ، Chief يصنّف رسالتك (سعيد/مضغوط/مستعجل/محبط) ويعدّل نبرته. نخزن المزاج في `chief_messages.mood`.
- **Small talk**: لو الرسالة مجرد دردشة (مو أمر)، يرد بطبيعية بدون ما يستدعي tools.

### المرحلة 4 — فريق ذكي (كل Agent له عقل وأدوات)
كل Agent في الجدول `agents` يصير عنده:
- `memory` خاص (جدول `agent_memories` مربوط بـ agent_id)
- `tools[]` — أدوات حقيقية مرتبطة (Outlook, Web Search, AI gen, Telegram notify…)
- `execute(task)` server function تشغّل Agent بنفس آلية Chief (loop + tools + memory)

لما Chief يستدعي `assign_task`، نشغّل الـ Agent في الخلفية، يحدّث `task_steps` (thought/action/result) لحظياً، ولما يخلص يرجع النتيجة لـ Chief، وChief يرد لك على Telegram.

### المرحلة 5 — الواجهة الحية
- صفحة `/chief`: عرض شجرة "Chief → Agent → Task → Steps" بـ Realtime من Supabase.
- بطاقة "ذاكرة Chief": تشوف وش يتذكر عنك، تقدر تعدّل أو تحذف.
- بطاقة "مزاج المحادثة" + الفريق الحي ومين يشتغل الحين.

---

## تفاصيل تقنية

- **AI SDK**: `streamText` + `tools: { ... }` + `stopWhen: stepCountIs(50)` لحلقة الـ tool calling.
- **Model**: `google/gemini-3-flash-preview` للسرعة، ترقية لـ `gemini-2.5-pro` لو القرار معقّد (Chief يقرر).
- **Embeddings**: عبر Lovable AI Gateway (نموذج embedding مدعوم) + عمود `vector` في Postgres مع `pgvector` extension.
- **التشغيل**: كله TanStack `createServerFn` — لا Edge Functions. الـ webhook الحالي `/api/public/telegram/webhook` يبقى كما هو لكن يستدعي Chief loop الجديد.
- **Background execution**: مهام الـ Agents تنفّذ async داخل نفس serverFn (Cloudflare Worker يدعم `waitUntil`-style عبر استمرار الطلب)، والـ UI يتابع عبر Supabase Realtime على `task_steps`.

---

## تغييرات قاعدة البيانات (Migration واحدة)
- `chief_memories` (id, user_id, kind, content, embedding vector(1536), importance, tags, last_accessed_at)
- `agent_memories` (id, agent_id, user_id, content, embedding, …)
- `chief_messages`: إضافة عمود `mood text`, `summary boolean`
- تفعيل extension `vector`
- RLS owner-only على الجداول الجديدة

---

## ترتيب التنفيذ المقترح
1. **المرحلة 1 + 2** معاً (Tools + Memory) — هذا اللي يحوّله من شات إلى Agent.
2. **المرحلة 3** (شخصية ومشاعر) — يعطيه الروح.
3. **المرحلة 4** (فريق ينفّذ فعلاً) — يخلّيه مدير حقيقي.
4. **المرحلة 5** (الواجهة الحية) — تشوف كل شي يصير.

---

## أسئلة سريعة قبل ما أبدأ التنفيذ
1. الشخصية: تبيه **رسمي ومحترف**، **ودود ومرح**، أو **مباشر ومختصر**؟
2. اللغة الافتراضية للردود: عربي فصحى، عامية سعودية، أو يطابق لغتك تلقائياً (الوضع الحالي)؟
3. أبدأ بالمرحلة 1+2 الحين (Tools + Memory)، أو تبي خطة أكثر تفصيلاً لمرحلة معيّنة أولاً؟