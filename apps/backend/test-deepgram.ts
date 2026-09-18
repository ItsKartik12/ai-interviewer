/**
 * Isolated Deepgram pipeline test. NEVER prints the API key or temp token.
 * Tests: temp-key creation (projects list + key create), then a real
 * WSS streaming session with synthesized speech -> final transcript.
 */
import "dotenv/config";

const key = process.env.DEEPGRAM_API_KEY;
if (!key) {
  console.error("DEEPGRAM_API_KEY missing in apps/backend/.env");
  process.exit(1);
}

function mask(s: string) {
  return s ? `${s.slice(0, 4)}…(${s.length} chars)` : "(empty)";
}

async function main() {
  // ---- Step 1: list projects (as backend does) ----
  const projectsRes = await fetch("https://api.deepgram.com/v1/projects", {
    headers: { Authorization: `Token ${key!.trim()}` },
    signal: AbortSignal.timeout(8000),
  });
  console.log("projects GET status:", projectsRes.status);
  if (!projectsRes.ok) {
    console.error("body:", (await projectsRes.text()).slice(0, 300));
    process.exit(1);
  }
  const projectsData = (await projectsRes.json()) as { projects?: Array<{ project_id: string; name?: string }> };
  const projectId = projectsData.projects?.[0]?.project_id;
  console.log("project count:", projectsData.projects?.length ?? 0, "| first id present:", Boolean(projectId));

  // ---- Step 2: create temporary key with usage:write (as backend does) ----
  const keyRes = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/keys`, {
    method: "POST",
    headers: { Authorization: `Token ${key!.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      comment: "diagnostic temp key - auto expires",
      scopes: ["usage:write"],
      time_to_live_in_seconds: 120,
    }),
    signal: AbortSignal.timeout(8000),
  });
  console.log("temp key POST status:", keyRes.status);
  const keyData = (await keyRes.json()) as { key?: string; api_key_id?: string; error?: unknown };
  if (!keyRes.ok || typeof keyData.key !== "string") {
    console.error("body:", JSON.stringify(keyData).slice(0, 300));
    process.exit(1);
  }
  console.log("temp key received:", mask(keyData.key), "| api_key_id present:", Boolean(keyData.api_key_id));
  const tempKey = keyData.key;

  // ---- Step 3: real WSS streaming session with the temp key ----
  const WebSocket = (await import("ws")).default;
  const {execSync} = await import("node:child_process");
  const {mkdtempSync} = await import("node:fs");
  const {tmpdir} = await import("node:os");
  const {join} = await import("node:path");

  // Generate 2s of spoken audio using Windows SAPI TTS -> wav
  const dir = mkdtempSync(join(tmpdir(), "dg-test-"));
  const wavPath = join(dir, "test.wav");
  const vbsPath = join(dir, "say.vbs");
  const wavEsc = wavPath.replace(/\\/g, "\\\\");
  const vbs = [
    'Dim sapi, fs',
    'Set sapi=CreateObject("SAPI.SpVoice")',
    'Set fs=CreateObject("SAPI.SpFileStream")',
    'fs.Format.Type = 34',
    `fs.Open "${wavEsc}", 3`,
    'Set sapi.AudioOutputStream = fs',
    'sapi.Speak "Hello, this is a microphone pipeline test."',
    'fs.Close',
  ].join("\n") + "\n";
  const {writeFileSync} = await import("node:fs");
  writeFileSync(vbsPath, vbs);
  execSync(`cscript //nologo "${vbsPath}"`, {timeout: 20000});
  const wav = await import("node:fs").then((fs) => fs.readFileSync(wavPath));
  console.log("test wav bytes:", wav.length);

  // Parse WAV header to get sample rate, then strip header for raw PCM streaming
  const sampleRate = wav.readUInt32LE(24);
  const bits = wav.readUInt16LE(34);
  const channels = wav.readUInt16LE(22);
  console.log("wav format:", { sampleRate, bits, channels });
  const pcm = wav.subarray(44);

  const url = `wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US&smart_format=true&interim_results=true&endpointing=500&encoding=linear16&sample_rate=${sampleRate}`;
  const socket = new WebSocket(url, ["token", tempKey]);

  const result = await new Promise<{opened: boolean; gotFinal: boolean; transcript: string; closeCode?: number; closeReason?: string; error?: string}>((resolve) => {
    const out = {opened: false, gotFinal: false, transcript: ""};
    let offset = 0;
    const CHUNK = sampleRate * (bits / 8) / 10; // 100ms of PCM
    let sender: NodeJS.Timeout | null = null;

    const timer = setTimeout(() => resolve({...out, error: "timeout waiting for final transcript"}), 30000);

    socket.on("open", () => {
      out.opened = true;
      console.log("WSS opened with temp key");
      sender = setInterval(() => {
        if (offset >= pcm.length) {
          if (sender) clearInterval(sender);
          socket.send(JSON.stringify({type: "Finalize"}));
          return;
        }
        socket.send(pcm.subarray(offset, offset + CHUNK));
        offset += CHUNK;
      }, 100);
    });

    socket.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        const alt = msg.channel?.alternatives?.[0];
        const text = alt?.transcript;
        if (msg.type === "Results" && text && msg.is_final) {
          out.gotFinal = true;
          out.transcript = text;
        }
      } catch { /* ignore */ }
    });

    socket.on("error", (err: Error) => {
      clearTimeout(timer);
      resolve({...out, error: `ws error: ${err.message}`});
    });

    socket.on("close", (code: number, reason: Buffer) => {
      if (sender) clearInterval(sender);
      clearTimeout(timer);
      resolve({...out, closeCode: code, closeReason: reason.toString()});
    });
  });

  console.log("WSS result:", JSON.stringify({...result, transcript: result.transcript.slice(0, 120)}));
  socket.close();
  process.exit(result.opened && result.gotFinal ? 0 : 2);
}

main().catch((err) => {
  console.error("test failed:", err?.message || err);
  process.exit(1);
});
