export function SetupNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-6 text-left">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      <p className="mt-4 text-xs text-muted-foreground">
        Copy <code className="rounded bg-muted px-1 py-0.5">apps/frontend/.env.example</code> to{" "}
        <code className="rounded bg-muted px-1 py-0.5">.env</code> and fill in PUBLIC_FIREBASE_*
        values. Restart the frontend after saving.
      </p>
    </div>
  );
}
