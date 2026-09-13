AI Interviewer

An adaptive, voice-enabled AI interview platform for realistic
technical and behavioral interviews, adaptive questioning, real-time
transcription, and evidence-backed skill assessment.

✨ Features

🎯 Role, company, seniority, and skill targeted interviews

🧠 AI-generated technical and soft-skill interview plans

🔄 Adaptive questioning based on previous answers

📈 Dynamic difficulty adjustment

🗣️ Real-time voice interviews using Deepgram

✍️ Editable transcripts before submission

🤖 Browser-based AI interviewer speech

🔎 GitHub/project-aware questioning

🚫 Question repetition avoidance

📊 Technical, communication, and problem-solving assessment

📝 Evidence-backed final evaluation report

🔐 Temporary Deepgram authentication

⚡ Bun/Turborepo development workflow

🗄️ Prisma + PostgreSQL data layer

🔌 OmniRoute LLM gateway

🧱 Designed to integrate with a larger SIH/career platform

🧭 How It Works

Candidate
│
├── Role
├── Company
├── Level
├── Primary Skill
└── GitHub / Project Context
│
▼
Role & Skill Analysis
│
▼
Interview Plan
│
▼
AI Introduction
│
▼
Behavioral / Basic Questions
│
▼
Adaptive Technical Questions
│
├── Voice Answer
│ ↓
│ Deepgram STT
│ ↓
│ Editable Transcript
│ ↓
│ Answer Evaluation
│ ↓
│ Next Question
│
▼
Final Evaluation
│
▼
Structured Skill Assessment
│
▼
Main SIH Platform

The interviewer is designed to react to the candidate, rather than
simply follow a fixed questionnaire.

🧠 Adaptive Interviewing

Questions use available interview context such as:

Target role

Target company

Candidate level

Selected skill

Recommended role skills

Previous questions

Previous answers

GitHub/project context

Current difficulty

Topics already covered

Question styles can include:

Conceptual

Practical

Debugging

Scenario-based

Architecture

Trade-offs

Project-specific

Behavioral

Communication

A typical progression may look like:

Introduction / project icebreaker
↓
Behavioral / communication question
↓
Technical concept
↓
Practical implementation
↓
Debugging / scenario
↓
Follow-up / deeper question
↓
Final evaluation

The exact sequence is adaptive.

🎤 Voice Interview Architecture

The browser captures microphone audio and streams it to Deepgram through
a WebSocket.

Microphone
↓
MediaRecorder
↓
Audio chunks
↓
Deepgram WebSocket
↓
Interim / Final Transcript
↓
Editable Answer
↓
Submit

The voice lifecycle explicitly handles:

AI SPEAKING
↓
MIC MUTED
↓
LISTENING
↓
CANDIDATE SPEAKING
↓
TRANSCRIPT
↓
SUBMIT
↓
PROCESSING
↓
NEXT QUESTION

While the interviewer speaks, the microphone track is muted to reduce
AI-voice echo being captured as the candidate's answer.

The implementation uses track-level muting rather than repeatedly
pausing/resuming the recorder, helping preserve a continuous audio
stream.

Voice reliability

The application includes:

Temporary Deepgram tokens

Continuous KeepAlive heartbeat

WebSocket lifecycle management

Reconnection with exponential backoff

Microphone/recorder lifecycle checks

Transcript preservation during reconnects

Duplicate socket protection

Duplicate submission protection

Speech-synthesis lifecycle protection

📊 Evaluation

The final evaluation is based on skills and topics actually assessed
during the interview.

Example structure:

{
"interviewId": "abc123",
"skills": [
{
"skill": "JavaScript",
"rating": 82,
"level": "Strong",
"strengths": [
"Good understanding of asynchronous programming"
],
"weaknesses": [
"Needs deeper understanding of event loop internals"
],
"evidence": [
"Correctly explained Promise-based API handling",
"Partially explained the event loop"
]
}
],
"overallStrengths": [],
"overallWeaknesses": [],
"summary": "..."
}

Evaluation principles

Only assess skills that were actually tested.

Do not assign random scores to unassessed skills.

Keep self-assessment separate from demonstrated performance.

Support ratings with interview evidence.

Treat interview performance as the primary demonstrated-skill
signal.

Use GitHub/project information as supporting context, not automatic
proof of mastery.

🧩 Self-Assessed vs Demonstrated Level

The platform intentionally separates:

Self-assessed level

React → Intermediate

from:

Demonstrated level

React → Intermediate
Score → 70/100

This allows the larger platform to identify gaps between what a
candidate believes they know and what they demonstrate during an
interview.

🛠️ Technology Stack

Frontend

React 19

TypeScript

React Router

Tailwind CSS

Bun

WebSocket

MediaRecorder

Browser Speech Synthesis

Backend

Bun

TypeScript

Express 5

Prisma

PostgreSQL

AI / Voice

OmniRoute

Configured LLM model through OmniRoute

Deepgram Speech-to-Text

Browser Speech Synthesis

Repository

Git

GitHub

Turborepo

📁 Project Structure

ai-interviewer/
│
├── apps/
│ ├── backend/
│ │ ├── index.ts
│ │ ├── omniroute.ts
│ │ ├── result.ts
│ │ ├── interview-prompts.ts
│ │ ├── scrapers/
│ │ │ └── github.ts
│ │ └── prisma/
│ │ ├── schema.prisma
│ │ └── migrations/
│ │
│ └── frontend/
│ └── src/
│ ├── components/
│ │ ├── Form.tsx
│ │ ├── Interview.tsx
│ │ └── Result.tsx
│ └── lib/
│ └── config.ts
│
├── package.json
├── turbo.json
└── README.md

🚀 Getting Started

Prerequisites

Install:

Git

Bun

PostgreSQL

Deepgram API access

OmniRoute / compatible LLM setup

Check Bun:

bun --version

Clone

git clone https://github.com/ItsKartik12/ai-interviewer.git
cd ai-interviewer

Install

bun install

🔐 Environment Variables

Create:

apps/backend/.env

Typical configuration:

PORT=3001
FRONTEND_URL=http://localhost:3000

DATABASE_URL=your_postgresql_connection_string

DEEPGRAM_API_KEY=your_deepgram_api_key

OMNIROUTE_URL=http://localhost:20128
OMNIROUTE_API_KEY=your_omniroute_api_key
OMNIROUTE_MODEL=oc/big-pickle

Use the project's .env.example as the authoritative list of variables
for the current implementation.

Never commit real secrets.

🗄️ Database

The project uses Prisma.

From the backend directory:

cd apps/backend
bunx prisma generate
bunx prisma migrate deploy

If working with an existing database, do not reset it just to
resolve migration issues. Preserve existing interview data and apply
additive migrations carefully.

🤖 OmniRoute

OmniRoute acts as the LLM gateway between the backend and the configured
model.

Typical local address:

http://localhost:20128

The intended architecture is:

Frontend → Backend → OmniRoute → LLM

This keeps provider credentials server-side and makes the model layer
easier to replace.

▶️ Run Locally

Terminal 1 --- OmniRoute

omniroute serve --port 20128 --no-open --no-tray

Terminal 2 --- Backend

cd apps/backend
bun run dev

Backend:

http://localhost:3001

Terminal 3 --- Frontend

cd apps/frontend
bun run dev

Frontend:

http://localhost:3000

If configured in the workspace, the complete development environment can
also be started with:

bun run dev

🎮 Using the Application

Open the frontend.

Select the target role.

Select or enter the target company.

Select the candidate's current level.

Select the primary skill.

Review recommended role skills.

Start the interview.

Allow microphone access.

Listen to the interviewer introduction.

Answer using the microphone.

Review/edit the generated transcript.

Submit the answer.

Continue through adaptive questions.

End the interview.

Review the final evaluation report.

🧪 Testing

Frontend TypeScript

npx tsc --project apps/frontend/tsconfig.json --noEmit

Backend TypeScript

npx tsc --project apps/backend/tsconfig.json --noEmit

Production build

bun run --cwd apps/frontend build.ts

API lifecycle

A useful end-to-end test should verify:

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

Manual voice test

Real Chrome testing is recommended because automated browser
environments may not provide a reliable physical microphone.

Verify:

Microphone permission

Microphone ready state

Deepgram connection

AI speaking state

Microphone muted while AI speaks

Live transcription

Transcript editing

Submission

Adaptive next question

Reconnection behavior

Final evaluation

🔒 Security

Permanent credentials must remain server-side.

Never expose:

DEEPGRAM_API_KEY
OMNIROUTE_API_KEY

The frontend should receive only temporary/limited credentials where
required, such as a temporary Deepgram token.

Do not commit:

.env

Use .env.example for documenting required configuration.

🏗️ Architecture Principles

AI Interviewer = Assessment Engine

The module focuses on:

Interviewing

Question generation

Adaptation

Skill assessment

Evidence-backed evaluation

Main SIH Platform = Candidate System of Record

When integrated, the main platform should own:

Candidate identity

Master skill profile

Job/opportunity matching

Learning recommendations

Long-term progress

The intended boundary is:

AI Interviewer
↓
Structured Assessment
↓
SIH Backend

The SIH backend should not need to know Deepgram or OmniRoute
implementation details.

🌐 Integration Vision

                 ┌─────────────────────┐
                 │    Main SIH App     │
                 └──────────┬──────────┘
                            │
                     Candidate Profile
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
     Job Matching      Learning Engine   AI Interviewer
                                            │
                                            ▼
                                      Skill Assessment
                                            │
                                            ▼
                                      Main SIH App

A future assessment payload can contain:

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
"strengths": [],
"weaknesses": [],
"evidence": []
}
],
"overallStrengths": [],
"overallWeaknesses": [],
"summary": "..."
}

This can later power:

Skill-gap detection

Job matching

Personalized learning paths

Interview readiness

Candidate progress tracking

Recommendation systems

🎨 Result Dashboard

The evaluation UI presents information such as:

Overall score

Performance tier

Self-assessed level

Demonstrated level

Assessed technical skills

Skill-specific strengths

Weaknesses

Evidence from the interview

Communication assessment

Problem-solving assessment

Final summary

The goal is to make the result useful beyond simply showing a single
score.

🚧 Current Limitations

The project is still evolving. Potential improvements include:

More verified public company context

Stronger resume parsing

Additional voice providers

Advanced speech analytics

Filler-word and speaking-pattern analysis

More sophisticated skill calibration

Multi-interview candidate history

Interview progress comparison

Human interviewer review

Production monitoring and observability

Authentication owned by the main platform

Deeper SIH backend integration

Company-specific interview content should use reliable public
information and must not claim access to confidential interview
questions.

🛣️ Roadmap

Core Interview Engine

Interview setup

Role/company/level context

Skill analysis

Adaptive questions

Difficulty adjustment

Follow-up questions

Repetition avoidance

Voice

Microphone capture

Deepgram transcription

Editable transcript

AI speech

Mic muting during AI speech

KeepAlive

Reconnection handling

Voice lifecycle cleanup

Evaluation

Final AI evaluation

Technical skill scoring

Communication assessment

Problem-solving assessment

Evidence-backed strengths

Evidence-backed weaknesses

Result dashboard

SIH Integration

Finalize integration contract

Connect candidate identity

Send structured skill assessment

Consume assessment in SIH backend

Generate skill-gap analysis

Connect learning recommendations

Connect job/opportunity matching

Production

Production deployment

Secure secret management

Monitoring

Rate limiting

Error tracking

Production database

Performance optimization

Final hackathon demo

🤝 Contributing

When contributing:

Preserve the existing interview flow.

Never expose secrets.

Validate external input.

Avoid breaking voice lifecycle handling.

Keep evaluation evidence-based.

Avoid unnecessary dependencies.

Run frontend and backend checks after significant changes.

Document major architectural changes.

📜 License

Add the intended project license before public distribution.

Also verify the licenses of third-party libraries, tutorials, reference
implementations, and copied code used in the project.

👨‍💻 Project

AI Interviewer

Repository: https://github.com/ItsKartik12/ai-interviewer

Built as an adaptive AI interview and skill-assessment system with a
focus on realistic voice interviews, evidence-backed evaluation, and
future integration with a larger candidate-development platform.
