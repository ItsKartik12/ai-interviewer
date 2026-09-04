import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import axios from "axios";
import { BACKEND_URL } from "@/lib/config";
import { useNavigate } from "react-router";
import { ArrowRight, Github, Loader2, Mic } from "lucide-react";
import { AppHeader } from "./AppHeader";

export function Form() {
    const [github, setGithub] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    async function onSubmit() {
        if (!github.trim()) {
            toast("Please provide a valid GitHub URL");
            return;
        }

        setLoading(true);
        try {
            const response = await axios.post(`${BACKEND_URL}/api/v1/pre-interview`, {
                github: github.trim(),
            });
            navigate(`/interview/${response.data.id}`);
        } catch (e) {
            toast("Something went wrong starting your interview. Please try again.");
            setLoading(false);
        }
    }

    return (
        <main className="relative flex h-screen w-screen items-center justify-center overflow-hidden px-6">
            <AppHeader />
            <div className="flex w-full max-w-xl flex-col items-center text-center">
                <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                    <Mic className="size-3.5 text-primary" />
                    Voice-based technical interview
                </span>

                <h1 className="bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
                    AI Interview Kickstart
                </h1>
                <p className="mt-4 max-w-md text-balance text-base text-muted-foreground">
                    Drop your GitHub profile and start a live, voice-driven interview tailored to
                    your work. Get instant feedback when you're done.
                </p>

                <div className="mt-10 w-full">
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-card/60 p-2 shadow-sm backdrop-blur focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
                        <div className="flex items-center pl-2 text-muted-foreground">
                            <Github className="size-5" />
                        </div>
                        <Input
                            value={github}
                            placeholder="https://github.com/your-username"
                            onChange={(e) => setGithub(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && !loading && onSubmit()}
                            disabled={loading}
                            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                        />
                        <Button
                            disabled={loading}
                            onClick={onSubmit}
                            size="lg"
                            className="shrink-0 gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" />
                                    Starting
                                </>
                            ) : (
                                <>
                                    Start interview
                                    <ArrowRight className="size-4" />
                                </>
                            )}
                        </Button>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                        We'll ask for microphone access once your interview begins.
                    </p>
                </div>
            </div>
        </main>
    );
}
