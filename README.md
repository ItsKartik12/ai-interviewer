<div align="center">

# 🤖 AI Interviewer

### Adaptive • Voice-Powered • Evidence-Based Technical Interviewing

<p>
  <strong>AI Interviewer is an intelligent interview and skill-assessment engine that conducts realistic technical and behavioral interviews, adapts to candidate performance, analyzes spoken answers, and produces structured skill-level assessments.</strong>
</p>

<p>
  <a href="https://github.com/ItsKartik12/ai-interviewer">
    <img src="https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github" alt="GitHub">
  </a>
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-Ready-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Bun-Runtime-F9F1E1?style=for-the-badge&logo=bun&logoColor=black" alt="Bun">
  <img src="https://img.shields.io/badge/Deepgram-Voice-101010?style=for-the-badge&logo=deepgram&logoColor=white" alt="Deepgram">
  <img src="https://img.shields.io/badge/PostgreSQL-Database-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL">
</p>

<p>
  <a href="#-what-is-ai-interviewer">What is it?</a> •
  <a href="#-how-the-interview-works">How it works</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-voice-engine">Voice Engine</a> •
  <a href="#-evaluation-engine">Evaluation</a> •
  <a href="#-setup">Setup</a> •
  <a href="#-roadmap">Roadmap</a>
</p>

</div>

---

<details open>
<summary><strong>📌 Project at a Glance</strong></summary>

<br>

| Area                | Implementation                                                              |
| ------------------- | --------------------------------------------------------------------------- |
| Interview type      | Technical + behavioral + project-focused                                    |
| Interaction         | Voice + editable text transcript                                            |
| Question generation | AI-driven and context-aware                                                 |
| Adaptation          | Previous answers, difficulty, topic coverage                                |
| Speech-to-text      | Deepgram WebSocket                                                          |
| AI speech           | Browser Speech Synthesis                                                    |
| LLM gateway         | OmniRoute                                                                   |
| Backend             | Express 5 + TypeScript + Bun                                                |
| Frontend            | React 19 + TypeScript                                                       |
| Database            | PostgreSQL + Prisma                                                         |
| Repository          | [ItsKartik12/ai-interviewer](https://github.com/ItsKartik12/ai-interviewer) |
| Primary purpose     | Candidate assessment and structured skill evaluation                        |
| Integration goal    | Larger SIH / career-development platform                                    |

</details>

# 🎯 What is AI Interviewer?

**AI Interviewer** is an adaptive AI-powered interview platform designed to simulate a realistic technical interview rather than behave like a static question generator.

A candidate provides interview context such as:

- Target role
- Target company
- Current level
- Primary skill
- GitHub/project context

The system analyzes this information, identifies relevant skills, creates an interview plan, and conducts the interview.

The important part is what happens **after each answer**.

Instead of:

```text
Question 1
Question 2
Question 3
Question 4
Question 5
```

the system follows an adaptive loop:

```text
Ask
 ↓
Listen
 ↓
Transcribe
 ↓
Evaluate
 ↓
Understand candidate performance
 ↓
Choose next topic / difficulty
 ↓
Ask a better follow-up
 ↓
Repeat
```

At the end, the system converts the interview into an **evidence-backed skill assessment** that can later be consumed by a larger platform.

---

# 💡 Why This Project?

Traditional interview practice platforms often have one of two problems:

### 📚 Static question banks

They can provide many questions, but they do not meaningfully react to the candidate.

### 💬 Generic AI chat

A chatbot can ask questions, but it may not maintain a structured assessment model or produce useful skill-level evidence.

AI Interviewer is designed to sit between those approaches:

> **A conversational interviewer on the surface, with a structured assessment engine underneath.**

The goal is not simply to generate an interview.

The goal is to answer:

> **"What does this candidate actually demonstrate?"**

---

# 🧭 How the Interview Works

<details open>
<summary><strong>1️⃣ Candidate Setup</strong></summary>

<br>

The candidate provides the interview context.

```text
Target Role       → Frontend Engineer
Target Company    → Google
Current Level     → Intermediate
Primary Skill     → React
GitHub / Projects → Available context
```

This context is used to make the interview relevant to the candidate.

</details>

<details>
<summary><strong>2️⃣ Role & Skill Analysis</strong></summary>

<br>

The system determines the technical and soft skills that should be considered for the selected role.

For example:

```text
Frontend Engineer
│
├── React
├── JavaScript
├── State Management
├── Component Design
├── Problem Solving
└── Communication
```

The interviewer then uses these skills to guide question generation and assessment.

</details>

<details>
<summary><strong>3️⃣ Interview Introduction</strong></summary>

<br>

The interviewer starts with a short introduction and a warm project/background question.

This avoids immediately dropping the candidate into a difficult technical problem.

</details>

<details>
<summary><strong>4️⃣ Behavioral & Basic Questions</strong></summary>

<br>

The interview can cover:

- Background
- Project experience
- Strengths and weaknesses
- Communication
- Decision making
- Project reflection
- Basic role-related questions

These questions help establish communication and reasoning context before deeper technical questions.

</details>

<details>
<summary><strong>5️⃣ Adaptive Technical Interview</strong></summary>

<br>

Technical questions can change based on the candidate's previous answers.

Possible question styles include:

- Conceptual
- Practical
- Debugging
- Scenario-based
- Architecture
- Trade-off
- Project-specific
- Follow-up

The system also tracks previously asked questions and covered topics to reduce unnecessary repetition.

</details>

<details>
<summary><strong>6️⃣ Final Assessment</strong></summary>

<br>

After the interview, the system produces a structured report containing:

- Overall performance
- Demonstrated skill level
- Technical skill scores
- Communication assessment
- Problem-solving assessment
- Strengths
- Weaknesses
- Interview evidence
- Improvement areas
- Final summary

</details>

---

# 🧠 Adaptive Interview Engine

The adaptive engine is one of the core parts of the project.

It considers the current interview state when deciding what should happen next.

```text
                  ┌───────────────────┐
                  │ Interview Context │
                  └─────────┬─────────┘
                            ↓
                 ┌─────────────────────┐
                 │ Previous Questions  │
                 │ Previous Answers    │
                 │ Current Difficulty  │
                 │ Topics Covered      │
                 │ Role + Skills       │
                 │ Project Context     │
                 └─────────┬───────────┘
                           ↓
                  ┌─────────────────┐
                  │ AI Decision     │
                  │ Engine          │
                  └────────┬────────┘
                           ↓
             ┌─────────────┼─────────────┐
             ↓             ↓             ↓
         New Topic      Follow-up    Difficulty
                                      Adjustment
             └─────────────┼─────────────┘
                           ↓
                    Next Question
```

### Example

Suppose a candidate correctly explains `useState`.

The interviewer should not simply ask another identical definition question.

It can move toward:

```text
useState
  ↓
Rendering behavior
  ↓
List rendering
  ↓
Keys
  ↓
Performance / practical scenario
```

If the candidate struggles, the system can instead stay at a more accessible level and probe the same concept differently.

---

# 🎤 Voice Engine

Voice interaction is implemented using **Deepgram Speech-to-Text** and browser speech synthesis.

```text
                 CANDIDATE
                     │
                     ▼
              🎙️ Microphone
                     │
                     ▼
             Browser Recorder
                     │
                     ▼
             Audio WebSocket
                     │
                     ▼
                 Deepgram
                     │
                     ▼
          Interim / Final Transcript
                     │
                     ▼
             ✏️ Editable Text
                     │
                     ▼
               Submit Answer
                     │
                     ▼
                AI Evaluation
```

The AI interviewer speaks using the browser's `speechSynthesis` API.

---

## 🔄 Voice State Machine

The application explicitly manages the voice lifecycle.

```text
┌───────────────┐
│ AI SPEAKING   │
└───────┬───────┘
        │
        ▼
┌────────────────────┐
│ Microphone Muted   │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Candidate Listening│
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Candidate Speaking │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Live Transcription │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Edit Transcript    │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Submit Answer      │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ AI Evaluation      │
└─────────┬──────────┘
          │
          ▼
       Next Turn
```

---

# 🛡️ Voice Reliability

Real-time voice introduces several problems that a normal form-based application does not have.

The implementation specifically handles:

<details>
<summary><strong>⏱️ Deepgram inactivity</strong></summary>

A continuous KeepAlive heartbeat is used while the WebSocket is open so that the connection does not unexpectedly disappear while the candidate is thinking, editing, or waiting for AI processing.

</details>

<details>
<summary><strong>🔌 WebSocket reconnect</strong></summary>

The application can reconnect after a connection failure using controlled retry/backoff behavior while preserving the candidate's transcript.

</details>

<details>
<summary><strong>🎙️ Microphone lifecycle</strong></summary>

Microphone and audio-track state are checked during reconnects instead of unnecessarily requesting microphone access again.

</details>

<details>
<summary><strong>🔇 AI voice echo prevention</strong></summary>

The microphone track is muted while the interviewer speaks, reducing the chance that the AI's own speech becomes the candidate's answer.

</details>

<details>
<summary><strong>📦 Continuous recording</strong></summary>

Track-level muting is preferred over repeatedly pausing and resuming the recorder, helping maintain a continuous audio stream.

</details>

<details>
<summary><strong>🗣️ Speech synthesis lifecycle</strong></summary>

The active speech utterance is retained and monitored so the UI does not become permanently stuck in an AI-speaking state.

</details>

---

# ✏️ Editable Transcription

The transcript is **not automatically treated as the final answer**.

The flow is:

```text
Candidate speaks
      ↓
Deepgram transcript
      ↓
Candidate reviews it
      ↓
Candidate edits if necessary
      ↓
Candidate submits
      ↓
AI evaluates submitted answer
```

This is useful because speech-to-text can occasionally misunderstand technical terms, code names, or domain-specific vocabulary.

It also prevents the system from submitting an answer before the candidate has had a chance to review it.

---

# 📊 Evaluation Engine

The final evaluation is designed around **demonstrated evidence**, not just one arbitrary score.

A result can contain:

```json
{
  "interviewId": "abc123",
  "skills": [
    {
      "skill": "React",
      "rating": 70,
      "level": "Intermediate",
      "strengths": ["Understands basic state management"],
      "weaknesses": ["Needs deeper understanding of rendering behavior"],
      "evidence": [
        "Correctly explained useState",
        "Needed additional guidance on list rendering"
      ]
    }
  ],
  "overallStrengths": [],
  "overallWeaknesses": [],
  "summary": "Candidate demonstrates an intermediate React foundation."
}
```

## 🎯 Assessment Principles

<details open>
<summary><strong>Only assess what was actually tested</strong></summary>

A skill should not receive a demonstrated rating simply because it appeared in the candidate's profile.

</details>

<details>
<summary><strong>Separate self-assessment from demonstrated skill</strong></summary>

The candidate may say:

```text
React → Advanced
```

while the interview may demonstrate:

```text
React → Intermediate
```

Both pieces of information remain useful.

</details>

<details>
<summary><strong>Use evidence</strong></summary>

A rating should be supported by observations from the interview rather than being an unexplained number.

</details>

<details>
<summary><strong>GitHub is supporting context</strong></summary>

Project/repository information can help generate relevant questions, but repository activity alone should not automatically be treated as proof of mastery.

</details>

---

# 📈 Example Result

The result page can communicate the assessment at multiple levels.

```text
┌───────────────────────────────────────────┐
│        INTERVIEW EVALUATION REPORT        │
├───────────────────────────────────────────┤
│                                           │
│ Overall Performance           60 / 100    │
│                                           │
│ Self-Assessed                 Intermediate│
│ Demonstrated                  Intermediate│
│                                           │
├───────────────────────────────────────────┤
│ Assessed Technical Skills                  │
│                                           │
│ React useState Hook             70 / 100  │
│                                           │
│ Strengths                                  │
│ ✓ Understands basic state management     │
│ ✓ Can explain basic hook usage           │
│                                           │
│ Areas to Improve                           │
│ • Rendering behavior                     │
│ • Deeper React internals                 │
└───────────────────────────────────────────┘
```

This makes the result more actionable than simply displaying:

```text
Your score: 60
```

---

# 🏗️ Architecture

```text
                         ┌─────────────────────┐
                         │   React Frontend    │
                         │                     │
                         │ Setup / Interview   │
                         │ Transcript / Result │
                         └──────────┬──────────┘
                                    │
                                    │ HTTP
                                    ▼
                         ┌─────────────────────┐
                         │   Express Backend   │
                         │                     │
                         │ Interview State     │
                         │ AI Decisions        │
                         │ Evaluation          │
                         │ Deepgram Token      │
                         └───────┬───────┬─────┘
                                 │       │
                    ┌────────────┘       └──────────────┐
                    ▼                                   ▼
           ┌─────────────────┐                 ┌─────────────────┐
           │   OmniRoute     │                 │    Deepgram     │
           │                 │                 │                 │
           │ LLM Gateway     │                 │ Speech-to-Text  │
           └────────┬────────┘                 └─────────────────┘
                    │
                    ▼
              ┌─────────────┐
              │ LLM Model   │
              └─────────────┘

                    Backend
                       │
                       ▼
                ┌────────────┐
                │ PostgreSQL │
                │ + Prisma   │
                └────────────┘
```

---

# 🧩 Main Components

<details>
<summary><strong>Frontend — Interview.tsx</strong></summary>

Handles the interactive interview experience, including question display, microphone state, transcript updates, voice states, submission, and interview progress.

</details>

<details>
<summary><strong>Frontend — Form.tsx</strong></summary>

Handles interview configuration such as role, company, level, and skill selection.

</details>

<details>
<summary><strong>Frontend — Result.tsx</strong></summary>

Displays the final evaluation, assessed skills, evidence, strengths, weaknesses, and performance information.

</details>

<details>
<summary><strong>Backend — index.ts</strong></summary>

Contains the primary interview API and interview lifecycle logic.

</details>

<details>
<summary><strong>Backend — interview-prompts.ts</strong></summary>

Centralizes the prompts and adaptive interview logic used to guide AI question generation and decisions.

</details>

<details>
<summary><strong>Backend — result.ts</strong></summary>

Handles final evaluation/result generation.

</details>

<details>
<summary><strong>Backend — omniroute.ts</strong></summary>

Provides the server-side interface to the configured OmniRoute LLM gateway.

</details>

<details>
<summary><strong>Backend — scrapers/github.ts</strong></summary>

Provides GitHub/project context used by the interview system.

</details>

<details>
<summary><strong>Database — Prisma</strong></summary>

Defines and persists interview-related data in PostgreSQL.

</details>

---

# 🛠️ Technology Stack

| Layer          | Technology               | Purpose                         |
| -------------- | ------------------------ | ------------------------------- |
| UI             | React 19                 | Interview interface             |
| Language       | TypeScript               | Type-safe frontend/backend code |
| Styling        | Tailwind CSS             | UI styling                      |
| Runtime        | Bun                      | Development/runtime tooling     |
| Backend        | Express 5                | API server                      |
| AI Gateway     | OmniRoute                | LLM abstraction                 |
| Speech-to-text | Deepgram                 | Real-time transcription         |
| AI Voice       | Browser Speech Synthesis | Interviewer speech              |
| Database       | PostgreSQL               | Persistent interview data       |
| ORM            | Prisma                   | Database access/schema          |
| Repository     | GitHub                   | Source control                  |
| Workspace      | Turborepo                | Monorepo management             |

---

# 📁 Project Structure

```text
ai-interviewer/
│
├── apps/
│   │
│   ├── backend/
│   │   ├── index.ts
│   │   ├── omniroute.ts
│   │   ├── result.ts
│   │   ├── interview-prompts.ts
│   │   │
│   │   ├── scrapers/
│   │   │   └── github.ts
│   │   │
│   │   └── prisma/
│   │       ├── schema.prisma
│   │       └── migrations/
│   │
│   └── frontend/
│       └── src/
│           ├── components/
│           │   ├── Form.tsx
│           │   ├── Interview.tsx
│           │   └── Result.tsx
│           │
│           └── lib/
│               └── config.ts
│
├── package.json
├── turbo.json
└── README.md
```

---

# 🚀 Setup

## 1. Prerequisites

Install:

- Git
- Bun
- PostgreSQL
- Deepgram API access
- OmniRoute / compatible LLM setup

Check Bun:

```bash
bun --version
```

---

## 2. Clone the repository

```bash
git clone https://github.com/ItsKartik12/ai-interviewer.git
cd ai-interviewer
```

---

## 3. Install dependencies

```bash
bun install
```

---

## 4. Configure environment variables

Create:

```text
apps/backend/.env
```

Typical configuration:

```env
PORT=3001
FRONTEND_URL=http://localhost:3000

DATABASE_URL=your_postgresql_connection_string

DEEPGRAM_API_KEY=your_deepgram_api_key

OMNIROUTE_URL=http://localhost:20128
OMNIROUTE_API_KEY=your_omniroute_api_key
OMNIROUTE_MODEL=oc/big-pickle
```

> Use the repository's `.env.example` as the source of truth for the exact variables required by the current implementation.

### ⚠️ Never commit secrets

Do not commit:

```text
.env
```

Use:

```text
.env.example
```

for safe configuration documentation.

---

# 🗄️ Database Setup

The project uses Prisma with PostgreSQL.

From the backend directory:

```bash
cd apps/backend
bunx prisma generate
bunx prisma migrate deploy
```

If working with an existing database, **do not reset the database just to solve a migration problem**. Preserve existing interview data and apply additive migrations carefully.

---

# 🤖 OmniRoute Setup

OmniRoute acts as the LLM gateway.

Typical local address:

```text
http://localhost:20128
```

Start it with the configuration used by your environment.

Example:

```bash
omniroute serve --port 20128 --no-open --no-tray
```

The intended architecture is:

```text
Frontend
   ↓
Backend
   ↓
OmniRoute
   ↓
LLM
```

This prevents permanent LLM credentials from being exposed in the browser and allows the underlying model/provider to be changed more easily.

---

# ▶️ Run the Project

### Terminal 1 — OmniRoute

```bash
omniroute serve --port 20128 --no-open --no-tray
```

### Terminal 2 — Backend

```bash
cd apps/backend
bun run dev
```

Backend:

```text
http://localhost:3001
```

### Terminal 3 — Frontend

```bash
cd apps/frontend
bun run dev
```

Frontend:

```text
http://localhost:3000
```

If the root workspace is configured accordingly:

```bash
bun run dev
```

can start the development workspace together.

---

# 🧪 Testing & Verification

## TypeScript

Frontend:

```bash
npx tsc --project apps/frontend/tsconfig.json --noEmit
```

Backend:

```bash
npx tsc --project apps/backend/tsconfig.json --noEmit
```

## Production build

```bash
bun run --cwd apps/frontend build.ts
```

## API lifecycle

A complete API test should verify:

```text
Role Analysis
     ↓
Interview Creation
     ↓
Turn 1
     ↓
Turn 2
     ↓
Adaptive Turns
     ↓
Final Evaluation
```

## Manual voice verification

Real Chrome testing is recommended for microphone functionality.

Verify:

- Microphone permission
- Microphone ready state
- Deepgram connection
- AI speaking state
- Mic muting while AI speaks
- Live transcription
- Transcript editing
- Answer submission
- Adaptive next question
- Reconnection
- Final evaluation

---

# 🔐 Security Model

The project intentionally keeps permanent credentials on the backend.

```text
             Browser
                │
                │ temporary credential where required
                ▼
             Backend
             /     \
            /       \
           ▼         ▼
      Deepgram    OmniRoute
```

The frontend should **never** receive:

```text
DEEPGRAM_API_KEY
OMNIROUTE_API_KEY
```

The backend should control access to external providers.

---

# 🔌 Integration with the Main SIH Platform

AI Interviewer is designed to become a module inside a larger candidate-development platform.

The separation is intentional.

### AI Interviewer owns

- Interview execution
- Question generation
- Adaptive difficulty
- Voice interaction
- Answer analysis
- Skill assessment
- Evidence generation

### Main SIH Platform owns

- Candidate identity
- Master candidate profile
- Job/opportunity matching
- Learning recommendations
- Long-term skill progress

The integration should look like:

```text
                  MAIN SIH PLATFORM
                         │
                         │ candidate context
                         ▼
                 ┌───────────────┐
                 │ AI Interviewer│
                 └───────┬───────┘
                         │
                  Interview Session
                         │
                         ▼
                 Structured Assessment
                         │
                         ▼
                  MAIN SIH PLATFORM
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         Skill Gap    Job Match   Learning
         Analysis                 Plan
```

---

# 📦 Future Assessment Contract

A clean integration payload can look like:

```json
{
  "interviewId": "abc123",
  "candidateId": "candidate_123",
  "role": "Frontend Engineer",
  "company": "Google",
  "skills": [
    {
      "skill": "React",
      "rating": 70,
      "level": "Intermediate",
      "strengths": ["Understands basic state management"],
      "weaknesses": ["Needs deeper understanding of rendering behavior"],
      "evidence": [
        "Correctly explained useState",
        "Needed additional guidance on list rendering"
      ]
    }
  ],
  "overallStrengths": [],
  "overallWeaknesses": [],
  "summary": "Candidate demonstrates an intermediate React foundation."
}
```

The exact schema can be finalized when the main SIH backend integration begins.

---

# 🔬 Design Decisions

<details>
<summary><strong>Why adaptive questions?</strong></summary>

A candidate's previous answer contains information about their knowledge. Using that information makes the next question more useful than blindly following a predefined list.

</details>

<details>
<summary><strong>Why editable transcripts?</strong></summary>

Technical speech-to-text can occasionally misinterpret framework names, APIs, code terms, or acronyms. Allowing candidates to correct the transcript gives the evaluation engine a cleaner representation of the intended answer.

</details>

<details>
<summary><strong>Why browser Speech Synthesis?</strong></summary>

It provides a simple voice layer for the MVP without adding another paid/external TTS dependency.

</details>

<details>
<summary><strong>Why Deepgram WebSocket?</strong></summary>

The interview requires streaming transcription rather than waiting for the candidate to upload a completed recording.

</details>

<details>
<summary><strong>Why separate self-assessment and demonstrated assessment?</strong></summary>

A candidate's perception of their ability and their demonstrated ability are different signals. Keeping both allows the larger platform to identify possible skill gaps.

</details>

<details>
<summary><strong>Why structured results?</strong></summary>

A score alone is difficult for another system to use. Skill-level evidence, strengths, weaknesses, and improvement areas can directly feed future recommendation and matching systems.

</details>

---

# 🎨 User Experience

The interface is organized around clear interview states.

```text
┌─────────────────────────────────────────┐
│             INTERVIEW SETUP             │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│           ROLE SKILL REVIEW             │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│          INTERVIEWER INTRO              │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│            LIVE INTERVIEW               │
│                                         │
│  Question         Voice Orb             │
│  Transcript       Mic State             │
│  Progress         Submit                │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│          EVALUATION REPORT              │
│                                         │
│  Score • Skills • Evidence • Gaps      │
└─────────────────────────────────────────┘
```

---

# 📱 Responsive & Accessibility Goals

The interview interface is designed to keep the most important actions visible:

- Current question
- Voice state
- Transcript
- Submit action
- Interview progress
- Reconnection state
- Evaluation result

The application also exposes explicit voice states rather than silently failing.

Examples:

```text
MIC READY
CONNECTED
LISTENING
AI SPEAKING
MIC MUTED
PROCESSING
RECONNECTING
ERROR
```

---

# 🚧 Current Limitations

The project is actively evolving.

Current/future improvement areas include:

- More verified public company context
- Stronger resume parsing
- Additional voice providers
- Advanced speech analytics
- Filler-word analysis
- Speaking-pattern analysis
- More sophisticated skill calibration
- Multi-interview candidate history
- Interview comparison over time
- Human interviewer review
- Production monitoring
- Production deployment
- Main-platform authentication integration
- Full SIH backend integration

Company-specific interview content should rely on reliable public information and should never claim access to confidential interview questions.

---

# 🛣️ Roadmap

<details open>
<summary><strong>Phase 1 — Core Interview Engine</strong></summary>

- [x] Interview setup
- [x] Role/company/level context
- [x] Skill analysis
- [x] Adaptive questions
- [x] Difficulty adjustment
- [x] Follow-up questions
- [x] Question repetition avoidance
- [x] GitHub/project-aware context

</details>

<details open>
<summary><strong>Phase 2 — Voice Interview</strong></summary>

- [x] Microphone capture
- [x] Deepgram streaming transcription
- [x] Editable transcript
- [x] AI speech
- [x] Mic muting during AI speech
- [x] KeepAlive handling
- [x] Reconnection handling
- [x] Voice lifecycle cleanup

</details>

<details open>
<summary><strong>Phase 3 — Evaluation</strong></summary>

- [x] Final AI evaluation
- [x] Technical skill scoring
- [x] Communication assessment
- [x] Problem-solving assessment
- [x] Evidence-backed strengths
- [x] Evidence-backed weaknesses
- [x] Result dashboard
- [x] Self vs demonstrated level

</details>

<details>
<summary><strong>Phase 4 — SIH Integration</strong></summary>

- [ ] Finalize assessment API contract
- [ ] Connect candidate identity
- [ ] Send structured skill assessment
- [ ] Consume assessment in SIH backend
- [ ] Skill-gap analysis
- [ ] Learning recommendations
- [ ] Job/opportunity matching
- [ ] Long-term candidate skill history

</details>

<details>
<summary><strong>Phase 5 — Production</strong></summary>

- [ ] Production deployment
- [ ] Secure secret management
- [ ] Monitoring
- [ ] Rate limiting
- [ ] Error tracking
- [ ] Production database
- [ ] Performance optimization
- [ ] Final hackathon demo flow

</details>

---

# 🤝 Contributing

Contributions should preserve the core interview experience.

Before submitting a change:

1. Keep API keys and secrets out of source control.
2. Avoid breaking the voice lifecycle.
3. Avoid unnecessary dependencies.
4. Keep evaluation evidence-based.
5. Validate external inputs.
6. Run frontend and backend checks.
7. Test important voice changes manually in Chrome.
8. Document major architectural changes.

---

# 📜 License

A project-specific license should be added before public distribution.

Also verify the licenses of third-party libraries, tutorials, reference implementations, and copied code used in the project.

---

# 👨‍💻 Project

<div align="center">

### AI Interviewer

**Adaptive AI Interviewing + Voice Interaction + Skill Assessment**

Built for a larger SIH-oriented candidate development platform.

<br>

<a href="https://github.com/ItsKartik12/ai-interviewer">
  <img src="https://img.shields.io/badge/View%20Repository-GitHub-181717?style=for-the-badge&logo=github" alt="View Repository">
</a>

<br><br>

**Built with React • TypeScript • Bun • Express • Deepgram • OmniRoute • Prisma • PostgreSQL**

</div>
