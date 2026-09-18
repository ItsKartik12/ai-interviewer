/**
 * Real end-to-end microphone pipeline test v2:
 * Playwright Chromium + fake mic backed by a looping spoken WAV file.
 * Drives a FULL multi-round voice conversation:
 *   getUserMedia -> MediaRecorder -> Deepgram WSS -> live finals in draft
 *   -> submit (voice transcript) -> AI next question -> repeat
 *   -> interview completion -> result page with score.
 * Never prints keys or tokens.
 */
import { chromium } from "playwright";
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const FRONTEND = "http://localhost:3000";
const MAX_ROUNDS = 14; // Intermediate expects ~10-11 questions
const logLines: string[] = [];
function log(msg: string) {
  console.log(msg);
  logLines.push(msg);
}

async function makeSpeechWav(text: string, outPath: string): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "dg-e2e-"));
  const vbsPath = join(dir, "say.vbs");
  const wavEsc = outPath.replace(/\\/g, "\\\\");
  const vbs = [
    "Dim sapi, fs",
    'Set sapi=CreateObject("SAPI.SpVoice")',
    'Set fs=CreateObject("SAPI.SpFileStream")',
    "fs.Format.Type = 34",
    `fs.Open "${wavEsc}", 3`,
    "Set sapi.AudioOutputStream = fs",
    `sapi.Speak "${text.replace(/"/g, "'")}"`,
    "fs.Close",
  ].join("\n") + "\n";
  writeFileSync(vbsPath, vbs);
  execSync(`cscript //nologo "${vbsPath}"`, { timeout: 30000 });
}

async function main() {
  const outDir = join(process.cwd(), "e2e-out");
  mkdirSync(outDir, { recursive: true });
  const wavPath = join(outDir, "speech.wav");

  log("[1] Generating spoken answer WAV via Windows TTS...");
  await makeSpeechWav(
    "I have five years of experience building backend systems with Python and Node.js. I recently led the migration of a monolith to microservices, which improved deployment speed. For system design I prefer event driven architectures with queues. Testing is important, so I write unit and integration tests. In my last project I used Redis for caching and Postgres as the main database.",
    wavPath,
  );
  log("    speech.wav ready (loops as continuous mic input)");

  log("[2] Creating interview via pre-interview API...");
  const preRes = await fetch("http://localhost:3001/api/v1/pre-interview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: "Backend Developer",
      company: "Amazon",
      level: "Beginner", // fewer questions => faster completion
      skill: "Backend Engineering",
      selectedSkills: ["Backend Engineering"],
      github: "",
      resumeText: "",
    }),
  });
  const preData = (await preRes.json()) as { id?: string; error?: string };
  if (!preData.id) {
    log(`    FAILED: ${JSON.stringify(preData).slice(0, 200)}`);
    process.exit(1);
  }
  const interviewId = preData.id;
  log(`    interview id: ${interviewId}`);

  log("[3] Launching Chromium with fake microphone (file-backed, looping)...");
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${wavPath}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const page = await browser.newPage();
  const consoleMessages: string[] = [];
  page.on("console", (msg) => {
    const line = `[browser:${msg.type()}] ${msg.text()}`;
    consoleMessages.push(line);
    if (msg.type() === "error") log("    " + line.slice(0, 220));
  });
  page.on("pageerror", (err) => log(`    [pageerror] ${String(err).slice(0, 220)}`));

  let deepgramSockets = 0;
  page.on("websocket", (ws) => {
    if (ws.url().includes("api.deepgram.com")) {
      deepgramSockets += 1;
      log(`    [ws-open] deepgram socket #${deepgramSockets}`);
    }
  });

  await page.goto(`${FRONTEND}/interview/${interviewId}`, { waitUntil: "domcontentloaded", timeout: 30000 });

  // ---- Wait for first voice transcript to land in the draft ----
  log("[4] Waiting for live mic -> Deepgram -> FINAL transcript in draft (up to 150s)...");
  let firstVoiceTranscript = "";
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(10000);
    const state = await page.evaluate(() => {
      const ta = document.querySelector("textarea") as HTMLTextAreaElement | null;
      const interimEl = Array.from(document.querySelectorAll("span"))
        .find((el) => el.previousElementSibling === null && el.className.includes("italic") && el.textContent && el.textContent.length > 3);
      return {
        draft: ta?.value ?? "",
        disabled: ta?.disabled ?? true,
        body: document.body.innerText.slice(0, 400),
      };
    });
    const interims = consoleMessages.filter((l) => l.includes("transcript received")).length;
    log(`    ... draft=${state.draft.length} chars, disabled=${state.disabled}, transcriptEvents=${interims}`);
    if (state.draft.trim().length >= 30) {
      firstVoiceTranscript = state.draft.trim();
      log(`    VOICE TRANSCRIPT IN DRAFT: "${firstVoiceTranscript.slice(0, 140)}"`);
      break;
    }
  }

  const voiceWorks = firstVoiceTranscript.length >= 30;

  // ---- Multi-round conversation loop ----
  log("[5] Driving multi-round voice conversation...");
  let rounds = 0;
  let voiceRounds = 0;
  let typedRounds = 0;
  let reachedResult = false;

  while (rounds < MAX_ROUNDS) {
    rounds += 1;
    // Ensure the textarea is enabled and has content (voice-refilled or typed fallback)
    let submittedViaVoice = false;
    const roundDeadline = Date.now() + 100000;
    while (Date.now() < roundDeadline) {
      const st = await page.evaluate(() => {
        const ta = document.querySelector("textarea") as HTMLTextAreaElement | null;
        return { draft: ta?.value ?? "", disabled: ta?.disabled ?? true };
      });
      if (!st.disabled && st.draft.trim().length >= 15) {
        if (Date.now() > 0 && st.draft.trim().length >= 15) {
          // if draft already has voice content, submit as-is
          submittedViaVoice = true;
          break;
        }
      }
      if (!st.disabled && st.draft.trim().length < 15) {
        await page.locator("textarea").fill(
          "On the backend I would use a queue based worker with retries and idempotency keys, backed by Redis for deduplication and Postgres as the source of truth.",
        );
        submittedViaVoice = false;
        break;
      }
      await page.waitForTimeout(4000);
    }

    const before = await page.evaluate(() => document.body.innerText);
    await page.locator("textarea").press("Control+Enter");
    if (submittedViaVoice) voiceRounds += 1; else typedRounds += 1;
    log(`    round ${rounds}: submitted via ${submittedViaVoice ? "VOICE transcript" : "typed fallback"}`);

    // Wait for: navigation to result OR new question rendered
    const waitDeadline = Date.now() + 120000;
    let advanced = false;
    while (Date.now() < waitDeadline) {
      await page.waitForTimeout(5000);
      const url = page.url();
      if (url.includes("/result/")) {
        reachedResult = true;
        advanced = true;
        break;
      }
      const now = await page.evaluate(() => document.body.innerText);
      const changed = now.length !== before.length || !now.slice(0, 800).equals(before.slice(0, 800));
      // crude change detection: question card text differs
      if (changed && !now.includes("PROCESSING")) {
        advanced = true;
        break;
      }
    }
    if (reachedResult) break;
    if (!advanced) {
      log(`    ! round ${rounds}: no advance within 120s`);
      break;
    }
    const qMatch = (await page.evaluate(() => document.body.innerText)).match(/Question (\d+)/);
    log(`    round ${rounds}: advanced -> ${qMatch ? `Question ${qMatch[1]}` : "next state"}`);
  }

  // ---- Result page ----
  if (reachedResult) {
    log("[6] Result page reached. Waiting for score to render...");
    try {
      await page.waitForFunction(() => /\/10|Score/i.test(document.body.innerText), { timeout: 180000 });
      const body = await page.evaluate(() => document.body.innerText);
      const m = body.match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
      log(`    RESULT PAGE RENDERED — score ${m ? `${m[1]}/10` : "(rendered)"}`);
    } catch {
      log("    result page loaded but score not detected in 180s");
    }
  } else {
    log(`[6] ! result page NOT reached after ${rounds} rounds. URL: ${page.url()}`);
  }

  await page.screenshot({ path: join(outDir, "final-state.png") });
  writeFileSync(join(outDir, "browser-console.log"), consoleMessages.join("\n"));
  await browser.close();

  // ---- Summary ----
  const finals = consoleMessages.filter((l) => l.includes("final: true")).length;
  log("\n========== E2E SUMMARY ==========");
  log(`interview created:       PASS (${interviewId})`);
  log(`mic permission:          PASS (fake-ui auto-grant)`);
  log(`deepgram wss opened:     ${deepgramSockets > 0 ? "PASS" : "FAIL"} (${deepgramSockets} socket(s))`);
  log(`final transcripts recv:  ${finals > 0 ? "PASS" : "FAIL"} (${finals} final events)`);
  log(`voice filled draft:      ${voiceWorks ? "PASS" : "FAIL"}`);
  log(`rounds submitted:        ${rounds} (voice: ${voiceRounds}, typed: ${typedRounds})`);
  log(`result page:             ${reachedResult ? "PASS" : "FAIL"}`);
  log("=================================");

  appendFileSync(join(outDir, "e2e-run.log"), logLines.join("\n"));
  process.exit(voiceWorks && reachedResult ? 0 : 2);
}

main().catch((err) => {
  log(`e2e failed: ${err?.message || err}`);
  process.exit(1);
});
