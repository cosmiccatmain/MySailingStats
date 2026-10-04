"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CREDITS_PER_SEARCH, fmtCredits } from "@/lib/plans";
import { SEARCH_TYPES, type SearchType } from "@/lib/search-types";
import { useWallet } from "@/lib/wallet";

const EXAMPLES = [
  "Try ‘Optimist Nationals’",
  "Try ‘Annapolis Yacht Club’",
  "Try a sailor, like ‘Wills Gandy’",
  "Try a sail number, like ‘22179’",
  "Try ‘Laser Midwinters’",
  "Try ‘Opti Team Trials’",
];

type Recognition = { start: () => void; stop: () => void; onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null; onend: (() => void) | null; lang: string; interimResults: boolean };

export function SearchBox(props: { initialQuery?: string; initialType?: SearchType; showMeta?: boolean; autoFocus?: boolean }) {
  const router = useRouter();
  const w = useWallet();
  const [q, setQ] = useState(props.initialQuery ?? "");
  const [type, setType] = useState<SearchType>(props.initialType ?? "all");
  const [ex, setEx] = useState(0);
  const [listening, setListening] = useState(false);
  const [canVoice, setCanVoice] = useState(false);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => {
    const t = setInterval(() => setEx((i) => (i + 1) % EXAMPLES.length), 3200);
    const SR = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition });
    setCanVoice(!!(SR.SpeechRecognition || SR.webkitSpeechRecognition));
    return () => clearInterval(t);
  }, []);
  useEffect(() => setQ(props.initialQuery ?? ""), [props.initialQuery]);

  const go = (query = q) => {
    const v = query.trim();
    if (v.length < 2) return;
    router.push(`/search?${new URLSearchParams({ q: v, ...(type !== "all" ? { type } : {}) })}`);
  };

  const voice = () => {
    if (listening) return rec.current?.stop();
    const W = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "en-US";
    r.interimResults = false;
    r.onresult = (e) => {
      const text = e.results[0][0].transcript.replace(/[.?!]$/, "");
      setQ(text);
      go(text);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  return (
    <div className="s-search">
      <form
        className="s-pill"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={EXAMPLES[ex]}
          aria-label="Search regattas, sailors, boats, coaches and clubs"
          autoFocus={props.autoFocus}
          enterKeyHint="search"
        />
        <select value={type} onChange={(e) => setType(e.target.value as SearchType)} aria-label="Search in">
          {SEARCH_TYPES.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        {canVoice && (
          <button type="button" className={`s-icon-btn${listening ? " listening" : ""}`} onClick={voice} aria-label={listening ? "Stop listening" : "Search by voice"}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
            </svg>
          </button>
        )}
        <button className="s-go" type="submit" aria-label="Search" disabled={q.trim().length < 2}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
      {props.showMeta !== false && (
        <div className="s-search-meta">
          <span>
            {CREDITS_PER_SEARCH} credits per search · {w.credits == null ? "unlimited" : `${fmtCredits(w.credits)} left`}
          </span>
        </div>
      )}
    </div>
  );
}
