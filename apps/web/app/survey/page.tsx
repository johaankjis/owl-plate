"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { components } from "../../lib/api.generated";

type Answers = components["schemas"]["SurveyAnswers"];
const questions = [
  {
    key: "campus",
    label: "Which campus are you usually on?",
    options: ["Kennesaw", "Marietta", "Both", "Prefer not to say"],
  },
  {
    key: "skipped_meals",
    label:
      "In the past month, how often did money or time lead you to skip a meal?",
    options: [
      "Never",
      "Once or twice",
      "Weekly",
      "More than weekly",
      "Prefer not to say",
    ],
  },
  {
    key: "seen_waste",
    label: "Have you seen leftover food from a campus event get thrown away?",
    options: ["Yes", "No", "Unsure"],
  },
  {
    key: "heard_too_late",
    label: "Have you heard about free leftover food too late to get any?",
    options: ["Yes", "No", "Unsure"],
  },
  {
    key: "heard_care",
    label: "Before this survey, had you heard of KSU CARE Services pantries?",
    options: ["Yes", "No", "Unsure"],
  },
  {
    key: "wants_alerts",
    label:
      "Would you choose to receive alerts when free food is available nearby?",
    options: ["Yes", "Maybe", "No"],
  },
  {
    key: "host_leftovers",
    label: "If you host events, what usually happens to leftovers?",
    options: [
      "Taken home",
      "Thrown away",
      "Posted in a group",
      "Other",
      "I do not host",
    ],
  },
] as const;

export default function SurveyPage() {
  const [answers, setAnswers] = useState<Answers>({ feedback: "" });
  const [consent, setConsent] = useState(false);
  const [accepting, setAccepting] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [submissionId] = useState(() => globalThis.crypto.randomUUID());

  useEffect(() => {
    fetch("/backend/survey/status")
      .then(async (res) => {
        if (!res.ok)
          throw new Error("Survey status unavailable. Please try again later.");
        const status: components["schemas"]["SurveyStatus"] = await res.json();
        setAccepting(status.accepting);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/backend/survey/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: submissionId,
          consent,
          preview: accepting === false,
          answers,
        }),
      });
      if (!res.ok)
        throw new Error("Your response was not saved. Please try again.");
      const receipt: components["schemas"]["SurveyReceipt"] = await res.json();
      setMessage(
        receipt.preview
          ? "Preview complete. No response was saved or counted."
          : "Thank you. Your response has been saved.",
      );
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Your response was not saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-owl-black px-4 py-8 text-zinc-100">
      <div className="mx-auto max-w-xl space-y-6">
        <header className="space-y-3">
          <p className="text-sm font-semibold text-owl-gold">
            OWL PLATE · STUDENT RESEARCH
          </p>
          <h1 className="text-3xl font-bold">Food after campus events</h1>
          <p className="leading-relaxed text-zinc-300">
            A voluntary two-minute survey for KSU students. Skip any question.
            We do not ask for names, emails, student IDs, phone numbers or
            precise locations. We report aggregate results with the sample size.
          </p>
          <p className="text-sm text-zinc-400">
            This is a student prototype, not an official KSU service or a
            promise of food. Please do not include identifying information.
          </p>
        </header>
        {accepting === false && (
          <p
            data-testid="survey-preview"
            className="rounded-xl border border-amber-400/40 bg-amber-950/30 p-4 text-amber-200"
          >
            Form preview — collection has not opened. Preview submissions are
            not saved or counted.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-rose-500 p-4">
            {error}
          </p>
        )}
        {done ? (
          <section
            role="status"
            className="rounded-xl border border-emerald-500 p-6"
          >
            <h2 className="text-xl font-semibold">{message}</h2>
          </section>
        ) : (
          <form onSubmit={submit} className="space-y-6">
            {questions.map((q, index) => (
              <fieldset
                key={q.key}
                className="rounded-xl border border-zinc-700 bg-owl-slate p-4"
              >
                <legend className="px-1 font-semibold">
                  {index + 1}. {q.label}
                </legend>
                <div className="mt-2 space-y-2">
                  {q.options.map((option) => (
                    <label
                      key={option}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-zinc-800"
                    >
                      <input
                        type="radio"
                        name={q.key}
                        value={option}
                        checked={answers[q.key] === option}
                        onChange={() =>
                          setAnswers({ ...answers, [q.key]: option })
                        }
                        className="h-5 w-5 accent-yellow-400"
                      />
                      {option}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setAnswers({ ...answers, [q.key]: null })}
                  className="mt-2 min-h-11 text-sm text-owl-gold underline"
                >
                  Skip / clear answer
                </button>
              </fieldset>
            ))}
            <label className="block space-y-2 font-semibold">
              8. Optional: What would make a leftover-food alert useful? Please
              do not include identifying information.
              <textarea
                name="feedback"
                maxLength={500}
                rows={4}
                value={answers.feedback || ""}
                onChange={(e) =>
                  setAnswers({ ...answers, feedback: e.target.value })
                }
                className="mt-2 w-full rounded-lg border border-zinc-600 bg-zinc-900 p-3 font-normal"
              />
              <span className="block text-xs font-normal text-zinc-400">
                Up to 500 characters. Leave blank to skip.
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-zinc-600 p-4">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-yellow-400"
              />
              <span>
                I choose to take part in this voluntary survey. I understand
                that I can skip any question.
              </span>
            </label>
            <button
              disabled={busy || !consent || accepting === null}
              className="min-h-12 w-full rounded-xl bg-owl-gold px-5 py-3 font-bold text-black disabled:opacity-40"
            >
              {busy
                ? "Sending…"
                : accepting
                  ? "Send response"
                  : "Preview submission"}
            </button>
          </form>
        )}
        <footer className="text-xs leading-relaxed text-zinc-400">
          Responses are stored separately from demo student identities. No
          advertising analytics are added to this form. Hosting providers may
          process standard technical logs; this survey does not save your IP
          address or browser information with your answers.
        </footer>
      </div>
    </main>
  );
}
